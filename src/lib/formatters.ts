// src/lib/formatters.ts
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Formata uma data para exibição
 * @param value - string ISO ou Date
 * @returns string formatada "dd/MM/yyyy HH:mm"
 */
export const formatDateTime = (value: string | Date | null): string => {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "dd/MM/yyyy HH:mm");
};

/**
 * Formata apenas a hora
 * @param value - string ISO ou Date
 * @returns string formatada "HH:mm"
 */
export const formatTime = (value: string | Date | null): string => {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "HH:mm");
};

/**
 * Formata duração em segundos para HH:MM:SS ou formato legível
 * @param seconds - duração em segundos
 * @param verbose - se true, retorna formato "Xh Ymin Zs"
 * @returns string formatada
 */
export const formatDuration = (seconds: number | null, verbose = false): string => {
  if (!seconds || seconds <= 0) return "-";
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (verbose) {
    if (h === 0 && m === 0) return `${s}s`;
    if (h === 0) return `${m}min ${s}s`;
    return `${h}h ${m}min`;
  }
  
  // Formato HH:MM:SS
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  
  if (h === 0) return `${mm}:${ss}`;
  return `${hh}:${mm}:${ss}`;
};

/**
 * Retorna o label do dia para agrupamento
 * Ex: "Hoje", "Ontem", "24 de Março"
 */
export const getDayLabel = (value: string | Date): string => {
  const d = typeof value === "string" ? parseISO(value) : value;
  
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  
  return format(d, "dd 'de' MMMM", { locale: ptBR });
};

/**
 * Retorna a chave do dia para agrupamento (YYYY-MM-DD)
 */
export const getDayKey = (value: string | Date): string => {
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "yyyy-MM-dd");
};

/**
 * Formata km para exibição
 */
export const formatKm = (value: number | null | undefined): string => {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR");
};
