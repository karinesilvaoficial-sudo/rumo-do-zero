#!/usr/bin/env python3
"""Harvey — caixa de ferramentas de documentos.

Uso:
  docs.py info <arquivo>                     metadados, páginas, tamanho, se é escaneado
  docs.py texto <arquivo> [-o saida.txt]     extrai texto (PDF, DOCX, XLSX, TXT/MD; outros via LibreOffice)
  docs.py cabecalhos <arquivo>               cabeçalhos/rodapés repetidos e estrutura de títulos
  docs.py comprimir <in.pdf> <out.pdf> [--qualidade 60] [--largura-max 1600]
  docs.py juntar <out.pdf> <a.pdf> <b.pdf> ...
  docs.py dividir <in.pdf> <pasta> [--paginas 1-3,7]
  docs.py converter <arquivo> [pasta]        qualquer formato de escritório -> PDF (LibreOffice)

Dependências: pypdf, pdfplumber, python-docx, openpyxl, Pillow (todas opcionais por comando).
"""
import argparse
import io
import os
import re
import subprocess
import sys
from collections import Counter


def tamanho(p):
    n = os.path.getsize(p)
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{n:.1f} {u}" if u != "B" else f"{n} B"
        n /= 1024


def ext(p):
    return os.path.splitext(p)[1].lower()


def paginas_pdf(p):
    """Texto por página. pdfplumber preserva melhor o layout; pypdf é o plano B."""
    try:
        import pdfplumber
        with pdfplumber.open(p) as pdf:
            return [(pg.extract_text() or "") for pg in pdf.pages]
    except Exception:
        from pypdf import PdfReader
        return [(pg.extract_text() or "") for pg in PdfReader(p).pages]


def texto_docx(p):
    import docx
    d = docx.Document(p)
    partes = []
    for par in d.paragraphs:
        if not par.text.strip():
            continue
        estilo = (par.style.name or "") if par.style is not None else ""
        m = re.match(r"(Heading|Título|Titulo)\s*(\d)", estilo)
        partes.append(("#" * int(m.group(2)) + " " if m else "") + par.text)
    for i, t in enumerate(d.tables, 1):
        partes.append(f"\n[Tabela {i}]")
        for row in t.rows:
            partes.append(" | ".join(c.text.strip() for c in row.cells))
    return "\n".join(partes)


def texto_xlsx(p):
    import openpyxl
    wb = openpyxl.load_workbook(p, data_only=True, read_only=True)
    out = []
    for ws in wb.worksheets:
        out.append(f"\n===== Planilha: {ws.title} =====")
        for row in ws.iter_rows(values_only=True):
            if any(v is not None for v in row):
                out.append(" | ".join("" if v is None else str(v) for v in row))
    return "\n".join(out)


def converter_pdf(p, pasta=None):
    pasta = pasta or os.path.dirname(os.path.abspath(p))
    os.makedirs(pasta, exist_ok=True)
    r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", pasta, p],
                       capture_output=True, text=True, timeout=300)
    saida = os.path.join(pasta, os.path.splitext(os.path.basename(p))[0] + ".pdf")
    if not os.path.exists(saida):
        sys.exit(f"Falha na conversão: {r.stderr.strip() or r.stdout.strip()}")
    return saida


def extrair(p):
    e = ext(p)
    if e == ".pdf":
        pgs = paginas_pdf(p)
        return "\n".join(f"\n===== Página {i} =====\n{t}" for i, t in enumerate(pgs, 1))
    if e == ".docx":
        return texto_docx(p)
    if e in (".xlsx", ".xlsm"):
        return texto_xlsx(p)
    if e in (".txt", ".md", ".csv", ".json", ".html", ".htm", ".xml"):
        return open(p, encoding="utf-8", errors="replace").read()
    import tempfile
    return extrair(converter_pdf(p, tempfile.mkdtemp(prefix="harvey-")))


def cmd_info(a):
    p = a.arquivo
    print(f"Arquivo: {p}\nTamanho: {tamanho(p)}\nTipo: {ext(p) or '?'}")
    if ext(p) == ".pdf":
        from pypdf import PdfReader
        r = PdfReader(p)
        print(f"Criptografado: {'sim' if r.is_encrypted else 'não'}")
        if r.is_encrypted:
            try:
                r.decrypt("")
            except Exception:
                return
        print(f"Páginas: {len(r.pages)}")
        for k, v in (r.metadata or {}).items():
            print(f"  {k.lstrip('/')}: {v}")
        pgs = paginas_pdf(p)
        chars = [len(t.strip()) for t in pgs]
        vazias = [i for i, c in enumerate(chars, 1) if c < 20]
        imgs = sum(len(pg.images) for pg in r.pages)
        print(f"Caracteres de texto: {sum(chars)} | Imagens: {imgs}")
        if vazias:
            print(f"Páginas sem texto (provável digitalização, precisa de OCR/leitura visual): {vazias[:40]}")
        try:
            if r.get_fields():
                print(f"Campos de formulário: {len(r.get_fields())}")
        except Exception:
            pass
    elif ext(p) == ".docx":
        import docx
        d = docx.Document(p)
        cp = d.core_properties
        print(f"Autor: {cp.author} | Última edição por: {cp.last_modified_by} | Revisão: {cp.revision}")
        print(f"Criado: {cp.created} | Modificado: {cp.modified}")
        print(f"Parágrafos: {len(d.paragraphs)} | Tabelas: {len(d.tables)} | Seções: {len(d.sections)}")


def cmd_texto(a):
    t = extrair(a.arquivo)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(t)
        print(f"{len(t)} caracteres -> {a.saida}")
    else:
        sys.stdout.write(t + "\n")


def _norm(linha):
    return re.sub(r"\d+", "#", linha.strip())


def cmd_cabecalhos(a):
    p = a.arquivo
    if ext(p) == ".docx":
        import docx
        d = docx.Document(p)
        for i, s in enumerate(d.sections, 1):
            cab = " / ".join(x.text for x in s.header.paragraphs if x.text.strip())
            rod = " / ".join(x.text for x in s.footer.paragraphs if x.text.strip())
            print(f"Seção {i}: cabeçalho = {cab or '(vazio)'} | rodapé = {rod or '(vazio)'}")
        print("\nEstrutura de títulos:")
        for par in d.paragraphs:
            estilo = (par.style.name or "") if par.style is not None else ""
            m = re.match(r"(Heading|Título|Titulo)\s*(\d)", estilo)
            if m and par.text.strip():
                print("  " * (int(m.group(2)) - 1) + "- " + par.text.strip())
        return
    if ext(p) != ".pdf":
        p = converter_pdf(p, __import__("tempfile").mkdtemp(prefix="harvey-"))
    pgs = [[l for l in t.splitlines() if l.strip()] for t in paginas_pdf(p)]
    n = len(pgs)
    topo, base = Counter(), Counter()
    for linhas in pgs:
        k = max(1, min(3, len(linhas) // 3))  # páginas curtas: não confundir corpo com cabeçalho
        for l in set(_norm(x) for x in linhas[:k]):
            topo[l] += 1
        for l in set(_norm(x) for x in linhas[-k:]):
            base[l] += 1
    minimo = max(2, int(n * 0.5))
    print(f"Páginas: {n}  (# = número variável, ex.: paginação)")
    print("Cabeçalhos repetidos:")
    for l, c in topo.most_common():
        if c >= minimo:
            print(f"  [{c}/{n}] {l}")
    print("Rodapés repetidos:")
    for l, c in base.most_common():
        if c >= minimo:
            print(f"  [{c}/{n}] {l}")
    print("\nPrimeiras linhas de cada página (identificação do documento):")
    for i, linhas in enumerate(pgs[:5], 1):
        print(f"  p.{i}: " + " ¦ ".join(linhas[:3])[:200])
    pad = re.compile(r"^\s*((CL[ÁA]USULA|CAP[ÍI]TULO|SE[ÇC][ÃA]O|T[ÍI]TULO|ANEXO|ART(IGO)?\.?)\s+\S+.*|\d+(\.\d+)*\.?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^a-z]{3,})$")
    print("\nEstrutura detectada (cláusulas, capítulos, seções):")
    achou = 0
    for i, linhas in enumerate(pgs, 1):
        for l in linhas:
            if pad.match(l) and len(l) < 140:
                print(f"  p.{i}: {l.strip()}")
                achou += 1
    if not achou:
        print("  (nenhum título no padrão usual; leia o texto para mapear a estrutura)")


def cmd_comprimir(a):
    from pypdf import PdfReader, PdfWriter
    from PIL import Image
    w = PdfWriter(clone_from=PdfReader(a.entrada))
    trocadas = 0
    for pg in w.pages:
        for img in pg.images:
            try:
                im = img.image
                if im is None or im.mode in ("1", "P", "LA", "RGBA") and a.preservar_transparencia:
                    continue
                grande = im.width > a.largura_max
                if grande:
                    im = im.resize((a.largura_max, max(1, round(im.height * a.largura_max / im.width))), Image.LANCZOS)
                if im.mode not in ("RGB", "L"):
                    im = im.convert("RGB")
                buf = io.BytesIO()
                im.save(buf, "JPEG", quality=a.qualidade, optimize=True)
                if grande or buf.tell() < len(img.data):
                    img.replace(im, quality=a.qualidade)
                    trocadas += 1
            except Exception as e:  # imagem em formato não suportado: mantém a original
                print(f"  aviso: imagem mantida ({e})", file=sys.stderr)
        pg.compress_content_streams()
    try:
        w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
    except TypeError:  # pypdf antigo
        w.compress_identical_objects()
    with open(a.saida, "wb") as f:
        w.write(f)
    antes, depois = os.path.getsize(a.entrada), os.path.getsize(a.saida)
    print(f"{tamanho(a.entrada)} -> {tamanho(a.saida)}  ({100 - depois * 100 / antes:.1f}% menor, {trocadas} imagens recomprimidas)")
    if depois >= antes:
        print("O arquivo já estava otimizado; use o original ou reduza --qualidade / --largura-max.")


def cmd_juntar(a):
    from pypdf import PdfWriter
    w = PdfWriter()
    for p in a.entradas:
        w.append(p)
    with open(a.saida, "wb") as f:
        w.write(f)
    print(f"{len(a.entradas)} arquivos -> {a.saida} ({len(w.pages)} páginas, {tamanho(a.saida)})")


def _faixas(spec, total):
    out = []
    for parte in spec.split(","):
        ini, _, fim = parte.partition("-")
        ini, fim = int(ini), int(fim or ini)
        out.append((max(1, ini), min(total, fim)))
    return out


def cmd_dividir(a):
    from pypdf import PdfReader, PdfWriter
    r = PdfReader(a.entrada)
    os.makedirs(a.pasta, exist_ok=True)
    base = os.path.splitext(os.path.basename(a.entrada))[0]
    faixas = _faixas(a.paginas, len(r.pages)) if a.paginas else [(i, i) for i in range(1, len(r.pages) + 1)]
    for ini, fim in faixas:
        w = PdfWriter()
        for i in range(ini - 1, fim):
            w.add_page(r.pages[i])
        nome = os.path.join(a.pasta, f"{base}_p{ini}" + (f"-{fim}" if fim != ini else "") + ".pdf")
        with open(nome, "wb") as f:
            w.write(f)
        print(nome)


def cmd_converter(a):
    print(converter_pdf(a.arquivo, a.pasta))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = ap.add_subparsers(dest="cmd", required=True)
    x = s.add_parser("info"); x.add_argument("arquivo"); x.set_defaults(f=cmd_info)
    x = s.add_parser("texto"); x.add_argument("arquivo"); x.add_argument("-o", "--saida"); x.set_defaults(f=cmd_texto)
    x = s.add_parser("cabecalhos"); x.add_argument("arquivo"); x.set_defaults(f=cmd_cabecalhos)
    x = s.add_parser("comprimir"); x.add_argument("entrada"); x.add_argument("saida")
    x.add_argument("--qualidade", type=int, default=60); x.add_argument("--largura-max", type=int, default=1600)
    x.add_argument("--preservar-transparencia", action="store_true", default=True); x.set_defaults(f=cmd_comprimir)
    x = s.add_parser("juntar"); x.add_argument("saida"); x.add_argument("entradas", nargs="+"); x.set_defaults(f=cmd_juntar)
    x = s.add_parser("dividir"); x.add_argument("entrada"); x.add_argument("pasta"); x.add_argument("--paginas"); x.set_defaults(f=cmd_dividir)
    x = s.add_parser("converter"); x.add_argument("arquivo"); x.add_argument("pasta", nargs="?"); x.set_defaults(f=cmd_converter)
    a = ap.parse_args()
    try:
        a.f(a)
    except BrokenPipeError:
        pass


if __name__ == "__main__":
    main()
