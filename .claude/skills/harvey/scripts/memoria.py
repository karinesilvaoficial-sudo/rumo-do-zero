#!/usr/bin/env python3
"""Harvey — memória persistente entre sessões.

Uso:
  memoria.py salvar [--transcricao arquivo.jsonl]   grava/atualiza o registro da sessão atual
  memoria.py contexto                               imprime o que carregar no início da sessão
  memoria.py buscar <termos...>                     procura em todas as sessões e lições
  memoria.py listar                                 índice das sessões gravadas
  memoria.py anotar "<texto>" [--tipo decisao|preferencia|funcionou|evitar|fato]

Os registros ficam em .claude/memory/ dentro do projeto. Em sessões na nuvem o contêiner é
descartado: a memória só sobrevive se for commitada e enviada (git add .claude/memory && commit && push).
Chamado por hooks, lê do stdin o JSON do hook (session_id, transcript_path, cwd).
"""
import datetime
import glob
import json
import os
import re
import sys

SEGREDOS = [
    (re.compile(r"\b(sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|AIza|eyJ)[A-Za-z0-9_\-\.]{16,}"), "[SEGREDO]"),
    (re.compile(r"(?i)\b(senha|password|passwd|secret|token|api[_-]?key|chave)\b(\s*[:=]\s*)\S+"), r"\1\2[SEGREDO]"),
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[EMAIL]"),
    (re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"), "[CPF]"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[NUMERO]"),
]
LIM_USUARIO, LIM_ASSISTENTE = 6000, 2500


def raiz():
    d = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    while d != "/" and not os.path.isdir(os.path.join(d, ".claude")) and not os.path.isdir(os.path.join(d, ".git")):
        d = os.path.dirname(d)
    return d if d != "/" else os.getcwd()


def pasta():
    p = os.path.join(raiz(), ".claude", "memory")
    os.makedirs(os.path.join(p, "sessoes"), exist_ok=True)
    return p


def limpar(t):
    for rx, sub in SEGREDOS:
        t = rx.sub(sub, t)
    return t


def stdin_json():
    if sys.stdin.isatty():
        return {}
    try:
        return json.loads(sys.stdin.read() or "{}")
    except Exception:
        return {}


def achar_transcricao(hook):
    if hook.get("transcript_path") and os.path.exists(hook["transcript_path"]):
        return hook["transcript_path"]
    slug = re.sub(r"[^A-Za-z0-9]", "-", raiz())
    arqs = glob.glob(os.path.expanduser(f"~/.claude/projects/{slug}/*.jsonl")) or \
        glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl"))
    return max(arqs, key=os.path.getmtime) if arqs else None


def texto_de(conteudo):
    if isinstance(conteudo, str):
        return conteudo
    if isinstance(conteudo, list):
        return "\n".join(b.get("text", "") for b in conteudo if isinstance(b, dict) and b.get("type") == "text")
    return ""


RUIDO = re.compile(r"<(system-reminder|local-command-caveat|command-name|command-message|command-args|local-command-stdout|task-notification)>.*?</\1>", re.S)


def ler_conversa(arq):
    msgs, arquivos, inicio, sid = [], set(), None, None
    for linha in open(arq, encoding="utf-8", errors="replace"):
        try:
            e = json.loads(linha)
        except Exception:
            continue
        if e.get("isSidechain") or e.get("isMeta"):
            continue
        sid = sid or e.get("sessionId")
        inicio = inicio or e.get("timestamp")
        tipo, m = e.get("type"), e.get("message") or {}
        if tipo == "user":
            t = RUIDO.sub("", texto_de(m.get("content"))).strip()
            if t and not t.startswith("[Request interrupted"):
                msgs.append(("Usuário", t[:LIM_USUARIO], e.get("timestamp")))
        elif tipo == "assistant":
            c = m.get("content")
            for b in c if isinstance(c, list) else []:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    fp = (b.get("input") or {}).get("file_path")
                    if fp and b.get("name") in ("Write", "Edit", "NotebookEdit"):
                        arquivos.add(os.path.relpath(fp, raiz()) if fp.startswith(raiz()) else fp)
            t = texto_de(c).strip()
            if t:
                if msgs and msgs[-1][0] == "Harvey":  # várias falas no mesmo turno: guarda a última, que é a conclusão
                    msgs[-1] = ("Harvey", t[:LIM_ASSISTENTE], e.get("timestamp"))
                else:
                    msgs.append(("Harvey", t[:LIM_ASSISTENTE], e.get("timestamp")))
    return msgs, sorted(arquivos), inicio, sid


def cmd_salvar(args):
    hook = stdin_json()
    arq = None
    if "--transcricao" in args:
        arq = args[args.index("--transcricao") + 1]
    arq = arq or achar_transcricao(hook)
    if not arq:
        print("memoria: nenhuma transcrição encontrada", file=sys.stderr)
        return
    msgs, arquivos, inicio, sid = ler_conversa(arq)
    if not any(q == "Usuário" for q, _, _ in msgs):
        return
    sid = (hook.get("session_id") or sid or os.path.splitext(os.path.basename(arq))[0])[:8]
    data = (inicio or datetime.datetime.now(datetime.timezone.utc).isoformat())[:10]
    p = pasta()
    destino = os.path.join(p, "sessoes", f"{data}_{sid}.md")
    pedidos = [t for q, t, _ in msgs if q == "Usuário"]
    titulo = limpar(re.sub(r"\s+", " ", pedidos[0]))[:110]
    out = [f"# Sessão {data} · {sid}", "", f"- Primeiro pedido: {titulo}",
           f"- Mensagens: {len(pedidos)} do usuário, {len(msgs) - len(pedidos)} do Harvey"]
    if arquivos:
        out.append("- Arquivos alterados: " + ", ".join(arquivos[:40]))
    out += ["", "## Conversa", ""]
    for quem, t, ts in msgs:
        out += [f"### {quem}" + (f" · {ts[11:16]}" if ts else ""), "", limpar(t), ""]
    open(destino, "w", encoding="utf-8").write("\n".join(out))
    indice()
    print(f"memoria: sessão gravada em {os.path.relpath(destino, raiz())}")


def indice():
    p = pasta()
    linhas = ["# Índice das sessões", "", "| Data | Sessão | Primeiro pedido | Msgs |", "|---|---|---|---|"]
    for arq in sorted(glob.glob(os.path.join(p, "sessoes", "*.md")), reverse=True):
        t = open(arq, encoding="utf-8").read()
        ped = re.search(r"^- Primeiro pedido: (.*)$", t, re.M)
        n = re.search(r"^- Mensagens: (\d+)", t, re.M)
        nome = os.path.basename(arq)[:-3]
        data, _, sid = nome.partition("_")
        linhas.append(f"| {data} | [{sid}](sessoes/{nome}.md) | {(ped.group(1) if ped else '').replace('|', '/')} | {n.group(1) if n else '?'} |")
    open(os.path.join(p, "INDICE.md"), "w", encoding="utf-8").write("\n".join(linhas) + "\n")
    return linhas


def cmd_contexto(_):
    p = pasta()
    print("<harvey-memoria>")
    print("Memória persistente do projeto (skill Harvey). Use antes de perguntar algo que já foi respondido.")
    lic = os.path.join(p, "harvey.md")
    if os.path.exists(lic):
        t = open(lic, encoding="utf-8").read().strip()
        print("\n## Lições e decisões\n" + (t[:6000] if len(t) > 6000 else t))
    ses = sorted(glob.glob(os.path.join(p, "sessoes", "*.md")), reverse=True)
    if ses:
        print(f"\n## Sessões anteriores ({len(ses)} gravadas; as 8 mais recentes)")
        for arq in ses[:8]:
            t = open(arq, encoding="utf-8").read()
            ped = re.search(r"^- Primeiro pedido: (.*)$", t, re.M)
            print(f"- {os.path.basename(arq)[:-3]}: {ped.group(1) if ped else ''}")
        ult = open(ses[0], encoding="utf-8").read()
        print("\n## Fim da última sessão\n" + ult[-2500:])
        print("\nPara detalhes: python3 .claude/skills/harvey/scripts/memoria.py buscar <termos>  ou leia .claude/memory/sessoes/<arquivo>.md")
    print("</harvey-memoria>")


def cmd_buscar(args):
    if not args:
        sys.exit("uso: memoria.py buscar <termos...>")
    termos = [a.lower() for a in args]
    p = pasta()
    achados = 0
    for arq in sorted(glob.glob(os.path.join(p, "sessoes", "*.md")), reverse=True) + [os.path.join(p, "harvey.md")]:
        if not os.path.exists(arq):
            continue
        linhas = open(arq, encoding="utf-8").read().splitlines()
        for i, l in enumerate(linhas):
            if all(t in l.lower() for t in termos):
                ctx = " ".join(x.strip() for x in linhas[max(0, i - 1):i + 2] if x.strip())
                print(f"{os.path.relpath(arq, raiz())}:{i + 1}: {ctx[:400]}")
                achados += 1
                if achados >= 40:
                    print("(mais de 40 resultados; refine os termos)")
                    return
    if not achados:
        print("Nada encontrado. Tente menos termos ou sinônimos.")


def cmd_listar(_):
    print("\n".join(indice()))


def cmd_anotar(args):
    tipo = "fato"
    if "--tipo" in args:
        i = args.index("--tipo")
        tipo = args[i + 1]
        args = args[:i] + args[i + 2:]
    if not args:
        sys.exit('uso: memoria.py anotar "<texto>" [--tipo decisao|preferencia|funcionou|evitar|fato]')
    rotulo = {"decisao": "Decisão", "preferencia": "Preferência", "funcionou": "Funcionou", "evitar": "Evitar", "fato": "Fato"}.get(tipo, "Fato")
    arq = os.path.join(pasta(), "harvey.md")
    hoje = datetime.date.today().isoformat()
    antigo = open(arq, encoding="utf-8").read() if os.path.exists(arq) else "# Memória do Harvey\n"
    cab, _, resto = antigo.partition("\n## ")
    resto = ("## " + resto) if resto else ""
    nova = f"- {rotulo}: {limpar(' '.join(args))}\n"
    if resto.startswith(f"## {hoje}"):
        tit, _, corpo = resto.partition("\n")
        resto = f"{tit}\n{nova}{corpo}"
    else:
        resto = f"## {hoje}\n{nova}\n{resto}"
    open(arq, "w", encoding="utf-8").write(cab.rstrip() + "\n\n" + resto)
    print(f"memoria: anotado ({rotulo})")


if __name__ == "__main__":
    cmds = {"salvar": cmd_salvar, "contexto": cmd_contexto, "buscar": cmd_buscar, "listar": cmd_listar, "anotar": cmd_anotar}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        sys.exit(__doc__)
    try:
        cmds[sys.argv[1]](sys.argv[2:])
    except BrokenPipeError:
        pass
