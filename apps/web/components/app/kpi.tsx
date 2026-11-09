"use client";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui";

/** Indicador: um toque abre composição, período, fórmula e registros de origem. Motion só em microinteração. */
export function Kpi({ label, value, hint, badge, detailTitle, children }: { label: string; value: ReactNode; hint?: ReactNode; badge?: ReactNode; detailTitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button type="button" className="kpi" onClick={() => setOpen(true)} whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.16 }}
        aria-haspopup="dialog" aria-label={`${label}: ver detalhes`}>
        <span className="kpi-label"><span>{label}</span>{badge}</span>
        <span className="kpi-value">{value}</span>
        {hint ? <span className="kpi-hint">{hint}</span> : null}
      </motion.button>
      <Sheet open={open} onClose={() => setOpen(false)} title={detailTitle}>{children}</Sheet>
    </>
  );
}
