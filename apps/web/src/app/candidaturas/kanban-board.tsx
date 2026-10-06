"use client";

import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ClosedJobBadge } from "@/app/radar/closed-job-badge";
import { CompanyLogo, getCompanyDisplayName } from "@/app/radar/company-logo";
import { getStatusConfig } from "@/lib/job-application-status";
import {
  archiveJobApplication,
  deleteJobApplication,
  type JobApplicationDto,
  type JobApplicationStatus,
  reorderJobApplicationsBoard,
  restoreJobApplication,
  updateJobApplicationStatus,
} from "@/lib/job-applications-api";
import { getJourneySessionInternalId } from "@/lib/journey-session";
import {
  BOARD_COLUMNS,
  type BoardColumnKey,
  type BoardColumns,
  buildBoardColumns,
  hasUnlockedCv,
  statusForColumn,
} from "./board-logic";
import { CvActionControl } from "./cv-action-control";
import { HiredCelebrationDialog } from "./hired-celebration";
import { FullScreenConfetti } from "./hired-confetti";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const COLUMN_KEYS = BOARD_COLUMNS.map((c) => c.key as BoardColumnKey);
const COLUMN_PREFIX = "col:";
const COLLAPSED_STORAGE_KEY = "earlycv:candidaturas:colunas-ocultas";

// Recolher coluna só existe no desktop (no celular é uma etapa por vez).
// Antes de montar assume desktop — mesmo HTML do servidor.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

// Entrada/saída suave dos diálogos do quadro — mesmo tempo dos modais do
// detalhe da candidatura (useModalFade). `close(after)` anima a saída e só
// então executa a ação.
function useDialogFade() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);
  const close = useCallback((after: () => void) => {
    setVisible(false);
    timerRef.current = window.setTimeout(after, 190);
  }, []);
  return { visible, close };
}

function fadeOverlayStyle(visible: boolean): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    background: "rgba(10,10,10,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 16px",
    opacity: visible ? 1 : 0,
    transition: "opacity 180ms ease",
  };
}

function fadeDialogStyle(visible: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: 380,
    background: "#fff",
    borderRadius: 16,
    border: "1px solid rgba(10,10,10,0.12)",
    boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
    padding: 20,
    fontFamily: GEIST,
    opacity: visible ? 1 : 0,
    transform: visible
      ? "translateY(0) scale(1)"
      : "translateY(8px) scale(0.98)",
    transition: "opacity 180ms ease, transform 180ms ease",
  };
}
const TERMINAL_STATUSES: JobApplicationStatus[] = [
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];
// Badge de status no card, só onde a coluna agrupa status que o usuário
// precisa distinguir: em "Salva", o andamento antes da candidatura (CV
// analisado / CV liberado — ações, não etapas); em "Finalizado", o desfecho.
// "Em entrevista" não: o status visível ali é sempre "Em entrevista"
// (getUserVisibleStatus agrupa processo/teste/oferta) — repetiria a coluna.
function statusBadgeFor(
  columnKey: BoardColumnKey,
  status: JobApplicationStatus,
): { label: string; config: ReturnType<typeof getStatusConfig> } | null {
  if (columnKey === "closed") {
    const config = getStatusConfig(status);
    return { label: config.label.toUpperCase(), config };
  }
  if (columnKey === "saved" && status === "ANALYZED") {
    return { label: "CV ANALISADO", config: getStatusConfig(status) };
  }
  if (columnKey === "saved" && status === "CV_READY") {
    return { label: "CV LIBERADO", config: getStatusConfig(status) };
  }
  return null;
}

type DerivedScore = { scoreBefore: number | null; scoreAfter: number | null };

type Toast = {
  text: string;
  tone?: "error";
  link?: { href: string; label: string };
  undo?: () => Promise<void>;
};

type PendingFinalize = {
  id: string;
  snapshot: BoardColumns;
};

function copyColumns(columns: BoardColumns): BoardColumns {
  return {
    saved: [...columns.saved],
    applied: [...columns.applied],
    interview: [...columns.interview],
    closed: [...columns.closed],
  };
}

function findColumn(
  columns: BoardColumns,
  id: string,
): BoardColumnKey | undefined {
  if (id.startsWith(COLUMN_PREFIX)) {
    return id.slice(COLUMN_PREFIX.length) as BoardColumnKey;
  }
  return COLUMN_KEYS.find((key) => columns[key].includes(id));
}

function columnLabel(key: BoardColumnKey) {
  return BOARD_COLUMNS.find((c) => c.key === key)?.label ?? key;
}

type Props = {
  // "archived": a aba Arquivadas — mesmo quadro, só pra consulta: sem
  // arrastar nem mover (pra mexer, restaura antes), com Restaurar/Excluir.
  mode?: "active" | "archived";
  // Candidaturas (ativas ou arquivadas) como vieram do servidor. O quadro mantém o próprio
  // estado (otimista) e só volta a se alinhar quando o servidor manda uma
  // lista nova (router.refresh).
  initialApplications: JobApplicationDto[];
  // Filtros da página (empresa + filtros rápidos), avaliados com o estado
  // atual do card — status muda ao mover.
  matchesFilter: (application: JobApplicationDto) => boolean;
  derivedScores: Record<string, DerivedScore>;
  hasCredits: boolean;
  // Saiu do quadro pras arquivadas (arquivar, ou finalizar — o servidor
  // arquiva Contratado/Recusado/Desistência automaticamente).
  onArchived?: (application: JobApplicationDto) => void;
  // Desfez um arquivamento feito pelo quadro.
  onUnarchived?: (applicationId: string) => void;
  onActiveCountChange?: (count: number) => void;
  // Arquivadas: restaurou (volta pras ativas) / excluiu de vez.
  onRestored?: (applicationId: string) => void;
  onDeleted?: (applicationId: string) => void;
};

export function KanbanBoard({
  mode = "active",
  initialApplications,
  matchesFilter,
  derivedScores,
  hasCredits,
  onArchived,
  onUnarchived,
  onActiveCountChange,
  onRestored,
  onDeleted,
}: Props) {
  const readOnly = mode === "archived";
  const [celebrating, setCelebrating] = useState(false);
  // Contratado: confete na tela toda + popup de parabéns (o mesmo do
  // detalhe da candidatura).
  const [hiredApplication, setHiredApplication] =
    useState<JobApplicationDto | null>(null);
  const onHired = useCallback((application: JobApplicationDto) => {
    setCelebrating(true);
    setHiredApplication(application);
  }, []);
  const stopCelebrating = useCallback(() => setCelebrating(false), []);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, JobApplicationDto>>(() =>
    Object.fromEntries(initialApplications.map((a) => [a.id, a])),
  );
  const [columns, setColumns] = useState<BoardColumns>(() =>
    buildBoardColumns(initialApplications),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pendingFinalize, setPendingFinalize] =
    useState<PendingFinalize | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [mobileColumn, setMobileColumn] = useState<BoardColumnKey>("applied");
  const [collapsed, setCollapsed] = useState<BoardColumnKey[]>([]);
  const isDesktop = useIsDesktop();
  const boardRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  const panRef = useRef<{ x: number; scrollLeft: number; id: number } | null>(
    null,
  );
  const [panning, setPanning] = useState(false);
  const dragSnapshotRef = useRef<BoardColumns | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Lista nova do servidor (router.refresh) → realinha o quadro.
  useEffect(() => {
    setItems(Object.fromEntries(initialApplications.map((a) => [a.id, a])));
    setColumns(buildBoardColumns(initialApplications));
  }, [initialApplications]);

  // Colunas ocultas: preferência só deste navegador.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) {
        setCollapsed(
          parsed.filter((key): key is BoardColumnKey =>
            COLUMN_KEYS.includes(key as BoardColumnKey),
          ),
        );
      }
    } catch {
      // armazenamento indisponível: todas abertas
    }
  }, []);

  const toggleCollapsed = useCallback((key: BoardColumnKey) => {
    setCollapsed((current) => {
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      try {
        window.localStorage.setItem(
          COLLAPSED_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // sem persistência: vale só nesta visita
      }
      return next;
    });
  }, []);

  // Setas de rolagem: habilitadas só quando há mais quadro naquele lado.
  const updateScrollEdges = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const left = board.scrollLeft > 2;
    const right = board.scrollLeft + board.clientWidth < board.scrollWidth - 2;
    setScrollEdges((current) =>
      current.left === left && current.right === right
        ? current
        : { left, right },
    );
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    updateScrollEdges();
    board.addEventListener("scroll", updateScrollEdges, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollEdges);
    observer?.observe(board);
    return () => {
      board.removeEventListener("scroll", updateScrollEdges);
      observer?.disconnect();
    };
  }, [updateScrollEdges]);

  // Largura do quadro muda ao recolher coluna / mover card (ResizeObserver
  // não vê scrollWidth): recalcula a cada render — é barato.
  useEffect(() => {
    updateScrollEdges();
  });

  function scrollBoard(direction: -1 | 1) {
    const board = boardRef.current;
    if (!board) return;
    board.scrollBy({
      left: direction * Math.max(300, board.clientWidth * 0.6),
      behavior: "smooth",
    });
  }

  // Clicar e arrastar no topo das colunas (ou em área vazia) rola o quadro
  // pros lados. Cards, botões e links ficam de fora — card arrasta card.
  function handlePanStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const target = event.target as HTMLElement;
    if (target.closest("article, button, a, input, select, [role='menu']")) {
      return;
    }
    const board = boardRef.current;
    // Sem rolagem a fazer, arrastar pros lados não faz nada.
    if (!board || board.scrollWidth <= board.clientWidth) return;
    panRef.current = {
      x: event.clientX,
      scrollLeft: board.scrollLeft,
      id: event.pointerId,
    };
    board.setPointerCapture(event.pointerId);
    setPanning(true);
  }

  function handlePanMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const board = boardRef.current;
    if (!pan || !board || pan.id !== event.pointerId) return;
    board.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
  }

  function handlePanEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.id !== event.pointerId) return;
    boardRef.current?.releasePointerCapture(event.pointerId);
    panRef.current = null;
    setPanning(false);
  }

  const activeCount = COLUMN_KEYS.reduce(
    (total, key) => total + columns[key].length,
    0,
  );
  useEffect(() => {
    onActiveCountChange?.(activeCount);
  }, [activeCount, onActiveCountChange]);

  const showToast = useCallback((next: Toast) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 7000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const isVisible = useCallback(
    (id: string) => items[id] !== undefined && matchesFilter(items[id]),
    [matchesFilter, items],
  );

  const sensors = useSensors(
    // Distância mínima: clique em botão/link do card não vira arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Toque: segurar pra arrastar, sem travar a rolagem da página.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Grava a mudança de etapa/ordem. `snapshot` = quadro antes do movimento
  // (pra desfazer ou reverter em erro).
  const persistMove = useCallback(
    async (
      id: string,
      fromColumn: BoardColumnKey,
      toColumn: BoardColumnKey,
      nextColumns: BoardColumns,
      snapshot: BoardColumns,
      chosenStatus?: JobApplicationStatus,
    ) => {
      const application = items[id];
      if (!application) return;
      const previousStatus = application.status;
      const changedColumn = fromColumn !== toColumn;
      const newStatus =
        chosenStatus ??
        (changedColumn ? statusForColumn(toColumn, application) : null);

      try {
        if (newStatus && newStatus !== previousStatus) {
          await updateJobApplicationStatus(
            id,
            newStatus,
            undefined,
            getJourneySessionInternalId(),
          );
        }

        if (newStatus) {
          setItems((current) => ({
            ...current,
            [id]: { ...application, status: newStatus },
          }));
        }
        await reorderJobApplicationsBoard(nextColumns[toColumn]);

        if (newStatus === "HIRED") onHired(application);

        if (changedColumn) {
          const finalized =
            newStatus !== null && TERMINAL_STATUSES.includes(newStatus);
          showToast({
            text: finalized
              ? `Candidatura finalizada como ${getStatusConfig(newStatus).label}`
              : `Movida para ${columnLabel(toColumn)}`,
            link:
              toColumn === "interview"
                ? {
                    href: `/candidaturas/${id}?acao=entrevista`,
                    label: "Agendar entrevista",
                  }
                : newStatus === "REJECTED"
                  ? {
                      href: `/candidaturas/${id}?acao=feedback`,
                      label: "Registrar feedback",
                    }
                  : undefined,
            undo: async () => {
              await updateJobApplicationStatus(
                id,
                previousStatus,
                undefined,
                getJourneySessionInternalId(),
              );
              setItems((current) => ({ ...current, [id]: application }));
              setColumns(snapshot);
              await reorderJobApplicationsBoard(snapshot[fromColumn]);
            },
          });
        }
      } catch {
        setItems((current) => ({ ...current, [id]: application }));
        setColumns(snapshot);
        showToast({
          text: "Não foi possível salvar a mudança. Tente de novo.",
          tone: "error",
        });
      }
    },
    [items, onHired, showToast],
  );

  // Ponto único de fim de movimento (arraste ou menu "Mover para").
  const settleMove = useCallback(
    (
      id: string,
      fromColumn: BoardColumnKey,
      toColumn: BoardColumnKey,
      nextColumns: BoardColumns,
      snapshot: BoardColumns,
    ) => {
      setColumns(nextColumns);
      if (toColumn === "closed" && fromColumn !== "closed") {
        // Finalizado agrupa 3 desfechos: pergunta qual antes de gravar.
        setPendingFinalize({ id, snapshot });
        return;
      }
      void persistMove(id, fromColumn, toColumn, nextColumns, snapshot);
    },
    [persistMove],
  );

  // Colisão: primeiro a etapa onde o ponteiro está, e só dentro dela o card
  // mais próximo. Só closestCorners falha com etapa vazia: os cantos dela
  // (esticada até a altura da mais cheia) ficam longe e os cards da etapa
  // vizinha "ganham" — o card caía na coluna ao lado. Teclado (sem ponteiro)
  // continua no closestCorners puro.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const columnHit = pointerWithin(args).find((c) =>
        String(c.id).startsWith(COLUMN_PREFIX),
      );
      if (!columnHit) return closestCorners(args);
      const target = findColumn(columns, String(columnHit.id));
      return closestCorners({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => findColumn(columns, String(container.id)) === target,
        ),
      });
    },
    [columns],
  );

  function handleDragStart(event: DragStartEvent) {
    setMenuFor(null);
    setActiveId(String(event.active.id));
    dragSnapshotRef.current = copyColumns(columns);
  }

  // Atravessando etapas: o card já entra na etapa de destino enquanto
  // arrasta (é o que mostra o espaço onde ele vai cair).
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const from = findColumn(columns, activeKey);
    const to = findColumn(columns, overKey);
    if (!from || !to || from === to) return;

    setColumns((current) => {
      const next = copyColumns(current);
      next[from] = next[from].filter((c) => c !== activeKey);
      const overIndex = next[to].indexOf(overKey);
      const insertAt = overIndex >= 0 ? overIndex : next[to].length;
      next[to].splice(insertAt, 0, activeKey);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const id = String(active.id);
    const snapshot = dragSnapshotRef.current ?? copyColumns(columns);
    dragSnapshotRef.current = null;
    setActiveId(null);

    if (!over) {
      setColumns(snapshot);
      return;
    }

    const fromColumn = findColumn(snapshot, id);
    const toColumn = findColumn(columns, id);
    if (!fromColumn || !toColumn) {
      setColumns(snapshot);
      return;
    }

    const next = copyColumns(columns);
    const overKey = String(over.id);
    if (!overKey.startsWith(COLUMN_PREFIX) && overKey !== id) {
      const oldIndex = next[toColumn].indexOf(id);
      const newIndex = next[toColumn].indexOf(overKey);
      if (oldIndex >= 0 && newIndex >= 0) {
        next[toColumn] = arrayMove(next[toColumn], oldIndex, newIndex);
      }
    }

    const unchanged =
      fromColumn === toColumn &&
      next[toColumn].join() === snapshot[fromColumn].join();
    if (unchanged) {
      setColumns(snapshot);
      return;
    }

    settleMove(id, fromColumn, toColumn, next, snapshot);
  }

  function handleDragCancel() {
    if (dragSnapshotRef.current) setColumns(dragSnapshotRef.current);
    dragSnapshotRef.current = null;
    setActiveId(null);
  }

  function moveViaMenu(id: string, toColumn: BoardColumnKey) {
    setMenuFor(null);
    const fromColumn = findColumn(columns, id);
    if (!fromColumn || fromColumn === toColumn) return;
    const snapshot = copyColumns(columns);
    const next = copyColumns(columns);
    next[fromColumn] = next[fromColumn].filter((c) => c !== id);
    next[toColumn] = [...next[toColumn], id];
    settleMove(id, fromColumn, toColumn, next, snapshot);
  }

  async function finalize(status: JobApplicationStatus) {
    const pending = pendingFinalize;
    if (!pending) return;
    setPendingFinalize(null);
    const fromColumn = findColumn(pending.snapshot, pending.id);
    if (!fromColumn) return;
    await persistMove(
      pending.id,
      fromColumn,
      "closed",
      columns,
      pending.snapshot,
      status,
    );
  }

  function cancelFinalize() {
    if (pendingFinalize) setColumns(pendingFinalize.snapshot);
    setPendingFinalize(null);
  }

  async function archive(id: string) {
    const application = items[id];
    if (!application) return;
    const snapshot = copyColumns(columns);
    const column = findColumn(columns, id);
    if (!column) return;
    const next = copyColumns(columns);
    next[column] = next[column].filter((c) => c !== id);
    setColumns(next);
    setMenuFor(null);
    try {
      const archived = await archiveJobApplication(
        id,
        getJourneySessionInternalId(),
      );
      onArchived?.({ ...application, archivedAt: archived.archivedAt });
      showToast({
        text: "Candidatura arquivada",
        undo: async () => {
          await restoreJobApplication(id);
          onUnarchived?.(id);
          setColumns(snapshot);
        },
      });
    } catch {
      setColumns(snapshot);
      showToast({
        text: "Não foi possível arquivar agora. Tente de novo.",
        tone: "error",
      });
    }
  }

  // Arquivadas: tira do quadro (otimista) e volta se o servidor recusar.
  function removeCard(id: string) {
    const snapshot = copyColumns(columns);
    const column = findColumn(columns, id);
    if (!column) return null;
    const next = copyColumns(columns);
    next[column] = next[column].filter((c) => c !== id);
    setColumns(next);
    return snapshot;
  }

  async function restore(id: string) {
    const snapshot = removeCard(id);
    if (!snapshot) return;
    try {
      await restoreJobApplication(id);
      onRestored?.(id);
      showToast({ text: "Candidatura restaurada para Ativas" });
    } catch {
      setColumns(snapshot);
      showToast({
        text: "Não foi possível restaurar agora. Tente de novo.",
        tone: "error",
      });
    }
  }

  async function confirmDelete() {
    const id = pendingDelete;
    setPendingDelete(null);
    if (!id) return;
    const snapshot = removeCard(id);
    if (!snapshot) return;
    try {
      await deleteJobApplication(id, getJourneySessionInternalId());
      onDeleted?.(id);
      showToast({ text: "Candidatura excluída" });
    } catch {
      setColumns(snapshot);
      showToast({
        text: "Não foi possível excluir agora. Tente de novo.",
        tone: "error",
      });
    }
  }

  async function runUndo() {
    const current = toast;
    if (!current?.undo) return;
    setToast(null);
    try {
      await current.undo();
    } catch {
      showToast({
        text: "Não foi possível desfazer. Atualize a página.",
        tone: "error",
      });
    }
  }

  const activeApplication = activeId ? items[activeId] : null;
  const pendingApplication = pendingFinalize ? items[pendingFinalize.id] : null;

  return (
    <div className="kb-root">
      <style>{`
        .kb-board { display: flex; overflow-x: auto; padding: 4px 0 16px; scrollbar-width: none; -ms-overflow-style: none; }
        .kb-track { display: flex; gap: 12px; align-items: stretch; justify-content: center; flex: 1 1 auto; min-width: min-content; }
        .kb-board::-webkit-scrollbar { display: none; }
        .kb-board[data-panning="true"] { cursor: grabbing; user-select: none; }
        .kb-board[data-scrollable="true"] .kb-col-head { cursor: grab; }
        .kb-board[data-panning="true"] .kb-col-head { cursor: grabbing; }
        .kb-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: 10px; }
        .kb-arrow { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(10,10,10,0.12); background: #fff; color: #0a0a0a; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .kb-arrow:hover:not(:disabled) { background: #f4f4f0; }
        .kb-arrow:disabled { opacity: 0.35; cursor: default; }
        .kb-col { flex: 1 1 260px; min-width: 232px; max-width: 300px; display: flex; flex-direction: column; min-height: 560px; border-radius: 16px; border: 1.5px solid transparent; transition: border-color 120ms ease, background 120ms ease; }
        .kb-tabs { display: none; }
        .kb-card { transition: box-shadow 140ms ease, border-color 140ms ease; }
        .kb-card:hover { border-color: rgba(10,10,10,0.16) !important; box-shadow: 0 6px 18px -8px rgba(10,10,10,0.22); }
        .kb-card:focus-visible { outline: 2px solid #0a0a0a; outline-offset: 2px; }
        .kb-icon-btn:hover { background: rgba(10,10,10,0.06) !important; }
        .kb-title:hover { text-decoration: underline; text-underline-offset: 3px; }
        @media (max-width: 767px) {
          .kb-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 0 0 12px; }
          .kb-toolbar { display: none; }
          .kb-board { overflow-x: visible; }
          .kb-track { width: 100%; }
          .kb-col { display: none; flex: 1 1 100%; min-width: 0; max-width: none; min-height: 0; }
          .kb-col[data-mobile-active="true"] { display: flex; }
        }
      `}</style>

      <nav className="kb-tabs" aria-label="Etapas">
        {BOARD_COLUMNS.map((column) => {
          const key = column.key as BoardColumnKey;
          const selected = mobileColumn === key;
          const count = columns[key].filter(isVisible).length;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => setMobileColumn(key)}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 36,
                padding: "0 12px",
                borderRadius: 999,
                border: selected
                  ? "1px solid #0a0a0a"
                  : "1px solid rgba(10,10,10,0.10)",
                background: selected ? "#0a0a0a" : "#fff",
                color: selected ? "#fafaf6" : "#3a3a36",
                fontFamily: GEIST,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {column.label}
              <span style={{ fontFamily: MONO, fontSize: 10.5, opacity: 0.7 }}>
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {scrollEdges.left || scrollEdges.right ? (
        <div className="kb-toolbar">
          <span style={{ fontFamily: GEIST, fontSize: 12, color: "#8a8a85" }}>
            Clique e arraste no topo das colunas para navegar
          </span>
          <button
            type="button"
            className="kb-arrow"
            aria-label="Rolar etapas para a esquerda"
            disabled={!scrollEdges.left}
            onClick={() => scrollBoard(-1)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="kb-arrow"
            aria-label="Rolar etapas para a direita"
            disabled={!scrollEdges.right}
            onClick={() => scrollBoard(1)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={boardRef}
          className="kb-board"
          data-panning={panning}
          // Arrastar pra rolar só existe quando há o que rolar.
          data-scrollable={scrollEdges.left || scrollEdges.right}
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
        >
          <div className="kb-track">
            {BOARD_COLUMNS.map((column) => {
              const key = column.key as BoardColumnKey;
              const visibleIds = columns[key].filter(isVisible);
              return (
                <BoardColumn
                  key={key}
                  columnKey={key}
                  label={column.label}
                  step={column.step}
                  accent={column.accent}
                  headerBg={column.headerBg}
                  dark={column.dark}
                  count={visibleIds.length}
                  mobileActive={mobileColumn === key}
                  dragging={activeId !== null}
                  readOnly={readOnly}
                  collapsed={isDesktop && collapsed.includes(key)}
                  onToggleCollapsed={() => toggleCollapsed(key)}
                >
                  <SortableContext
                    items={visibleIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {visibleIds.map((id) => {
                      const application = items[id];
                      if (!application) return null;
                      return (
                        <SortableCard
                          key={id}
                          application={application}
                          columnKey={key}
                          scoreColor={column.scoreColor}
                          derivedScore={derivedScores[id]}
                          hasCredits={hasCredits}
                          menuOpen={menuFor === id}
                          onToggleMenu={() =>
                            setMenuFor((current) =>
                              current === id ? null : id,
                            )
                          }
                          onMove={(to) => moveViaMenu(id, to)}
                          onArchive={() => void archive(id)}
                          readOnly={readOnly}
                          onRestore={() => void restore(id)}
                          onDelete={() => setPendingDelete(id)}
                        />
                      );
                    })}
                  </SortableContext>
                </BoardColumn>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activeApplication ? (
            <div
              style={{
                width: 264,
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.12)",
                borderRadius: 13,
                padding: "12px 13px",
                fontFamily: GEIST,
                transform: "rotate(-2deg)",
                boxShadow: "0 18px 36px -12px rgba(10,10,10,0.35)",
                cursor: "grabbing",
              }}
            >
              <div style={{ fontSize: 12, color: "#6a6560", marginBottom: 4 }}>
                {getCompanyDisplayName(activeApplication.companyName)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>
                {activeApplication.jobTitle}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {hiredApplication ? (
        <HiredPopup
          application={hiredApplication}
          onClose={() => setHiredApplication(null)}
        />
      ) : null}

      {celebrating ? <FullScreenConfetti onDone={stopCelebrating} /> : null}

      {pendingDelete && items[pendingDelete] ? (
        <DeleteDialog
          application={items[pendingDelete]}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      {pendingFinalize && pendingApplication ? (
        <FinalizeDialog
          application={pendingApplication}
          onPick={(status) => void finalize(status)}
          onCancel={cancelFinalize}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            maxWidth: "calc(100vw - 32px)",
            background: "#0a0a0a",
            color: "#fafaf6",
            borderRadius: 12,
            padding: "10px 10px 10px 16px",
            boxShadow: "0 16px 40px -12px rgba(0,0,0,0.45)",
            fontFamily: GEIST,
            fontSize: 13.5,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: toast.tone === "error" ? "#ef4444" : "#c6ff3a",
            }}
          />
          <span>{toast.text}</span>
          {toast.link ? (
            <Link
              href={toast.link.href}
              style={{
                color: "#fafaf6",
                fontWeight: 600,
                fontSize: 12.5,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {toast.link.label}
            </Link>
          ) : null}
          {toast.undo ? (
            <button
              type="button"
              onClick={() => void runUndo()}
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid rgba(250,250,246,0.25)",
                background: "transparent",
                color: "#c6ff3a",
                fontFamily: GEIST,
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              Desfazer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BoardColumn({
  columnKey,
  label,
  step,
  accent,
  headerBg,
  dark,
  count,
  mobileActive,
  dragging,
  readOnly,
  collapsed,
  onToggleCollapsed,
  children,
}: {
  columnKey: BoardColumnKey;
  label: string;
  step: number;
  accent: string;
  headerBg: string;
  dark: boolean;
  count: number;
  mobileActive: boolean;
  dragging: boolean;
  readOnly: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_PREFIX}${columnKey}`,
  });

  const toggleButton = (
    <button
      type="button"
      className="kb-icon-btn"
      aria-label={collapsed ? `Expandir ${label}` : `Ocultar ${label}`}
      aria-expanded={!collapsed}
      onClick={onToggleCollapsed}
      style={{
        width: 28,
        height: 28,
        flexShrink: 0,
        border: 0,
        borderRadius: 8,
        background: "transparent",
        color: "#6a6560",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {collapsed ? <path d="m6 9 6 6 6-6" /> : <path d="m6 15 6-6 6 6" />}
      </svg>
    </button>
  );

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className="kb-col"
      data-mobile-active={mobileActive}
      data-collapsed={collapsed}
      style={{
        // Recolhida: só o cabeçalho (a lista some na vertical). Continua
        // aceitando card solto — entra no fim da etapa.
        minHeight: collapsed ? 0 : undefined,
        // As abertas esticam até a mais alta do quadro; a recolhida não.
        alignSelf: collapsed ? "flex-start" : undefined,
        background: isOver ? "rgba(198,255,58,0.12)" : headerBg,
        borderColor: isOver ? "#0a0a0a" : "transparent",
      }}
    >
      <div
        className="kb-col-head"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "12px 10px 10px 14px",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 600,
            background: dark ? accent : "#fafaf6",
            color: dark ? "#fafaf6" : "#3a3a36",
            border: `1.5px solid ${accent}`,
          }}
        >
          {step}
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: GEIST,
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: "#0a0a0a",
          }}
        >
          {label}
        </h2>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 500,
            color: "#6a6a66",
            background: "rgba(10,10,10,0.05)",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          {count}
        </span>
        {toggleButton}
      </div>
      {collapsed ? null : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "4px 10px 14px",
            flex: 1,
          }}
        >
          {children}
          {count === 0 ? (
            <div
              style={{
                border: "1.5px dashed rgba(10,10,10,0.14)",
                borderRadius: 12,
                padding: "22px 12px",
                textAlign: "center",
                fontFamily: GEIST,
                fontSize: 12,
                color: "#8a8a85",
              }}
            >
              {readOnly
                ? "Nenhuma candidatura arquivada nesta etapa"
                : columnKey === "closed"
                  ? "Solte aqui para finalizar a candidatura"
                  : dragging
                    ? "Solte o card aqui"
                    : "Nenhuma candidatura nesta etapa"}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SortableCard({
  application,
  columnKey,
  scoreColor,
  derivedScore,
  hasCredits,
  menuOpen,
  onToggleMenu,
  onMove,
  onArchive,
  readOnly,
  onRestore,
  onDelete,
}: {
  application: JobApplicationDto;
  columnKey: BoardColumnKey;
  scoreColor: string | null;
  derivedScore?: DerivedScore;
  hasCredits: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onMove: (to: BoardColumnKey) => void;
  onArchive: () => void;
  readOnly: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application.id, disabled: readOnly });
  // Excluir só arquivada e sem CV liberado (CV pago nunca é apagado).
  const canDelete = readOnly && !hasUnlockedCv(application);

  const detailUrl = `/candidaturas/${application.id}`;
  const statusBadge = statusBadgeFor(columnKey, application.status);
  const scoreBefore =
    derivedScore?.scoreBefore ?? application.scoreBefore ?? null;
  const scoreAfter = derivedScore?.scoreAfter ?? application.scoreAfter ?? null;
  const bestScore =
    derivedScore?.scoreAfter ?? application.bestScore ?? scoreAfter;
  const displayedScore = bestScore ?? scoreAfter ?? scoreBefore;
  const color = scoreColor ?? "#2a6a10";
  // "CV LIBERADO" (status) já diz isso na coluna Salva.
  const hasCvReady =
    application.bestCvState === "ready" && application.status !== "CV_READY";
  const notAnalyzed = application.status === "SAVED" && displayedScore === null;

  return (
    <article
      ref={setNodeRef}
      {...(readOnly ? {} : attributes)}
      {...(readOnly ? {} : listeners)}
      aria-roledescription={readOnly ? undefined : "card arrastável"}
      aria-label={`${application.jobTitle} — ${getCompanyDisplayName(application.companyName)}`}
      className="kb-card"
      style={{
        position: "relative",
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.09)",
        borderRadius: 13,
        padding: "13px 13px 11px",
        cursor: readOnly ? "default" : isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.35 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: "manipulation",
        fontFamily: GEIST,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 9,
        }}
      >
        <CompanyLogo
          name={application.companyName}
          logoUrl={application.companyLogoUrl}
          websiteUrl={application.companyWebsiteUrl}
          size={28}
          borderRadius={7}
          fontSize={11}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "#3a3a36",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {getCompanyDisplayName(application.companyName)}
          </div>
          {application.location ? (
            <div
              style={{
                fontSize: 11,
                color: "#8a8a85",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {application.location}
            </div>
          ) : null}
        </div>
        {readOnly ? null : (
          <button
            type="button"
            className="kb-icon-btn"
            aria-label="Mover para outra etapa"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              border: 0,
              borderRadius: 8,
              background: "transparent",
              color: "#6a6560",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        )}
      </div>

      <Link
        href={detailUrl}
        className="kb-title"
        draggable={false}
        style={{
          display: "block",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: -0.2,
          lineHeight: 1.3,
          color: "#0a0a0a",
          textDecoration: "none",
          marginBottom: 10,
        }}
      >
        {application.jobTitle}
      </Link>

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 11 }}
      >
        {application.jobClosed ? <ClosedJobBadge variant="pill" /> : null}
        {statusBadge ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              borderRadius: 999,
              padding: "3px 8px 3px 7px",
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 0.3,
              lineHeight: 1.2,
              background: statusBadge.config.bg,
              color: statusBadge.config.color,
              border: `1px solid ${statusBadge.config.border}`,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: statusBadge.config.dot,
              }}
            />
            {statusBadge.label}
          </span>
        ) : null}
        {hasCvReady ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 999,
              padding: "3px 8px",
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 0.3,
              lineHeight: 1.2,
              color: "#3a5008",
              background: "rgba(198,255,58,0.22)",
              border: "1px solid rgba(110,150,20,0.25)",
            }}
          >
            CV ADAPTADO
          </span>
        ) : null}
        {application.nextActionAt ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              borderRadius: 999,
              padding: "3px 8px",
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 0.3,
              lineHeight: 1.2,
              color: "#7a5a04",
              background: "rgba(245,197,24,0.18)",
              border: "1px solid rgba(180,140,10,0.25)",
            }}
          >
            ENTREVISTA{" "}
            {new Date(application.nextActionAt)
              .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
              .toUpperCase()}
          </span>
        ) : null}
        {application.jobUrl ? (
          <span
            title="Link da vaga salvo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 999,
              padding: "3px 7px",
              color: "#5a5a55",
              background: "#fff",
              border: "1px solid rgba(10,10,10,0.10)",
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-label="Link da vaga salvo"
              role="img"
            >
              <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderTop: "1px solid rgba(10,10,10,0.06)",
          paddingTop: 10,
          // Coluna estreita: o botão de CV desce pra linha de baixo.
          flexWrap: "wrap",
          rowGap: 8,
        }}
      >
        {displayedScore !== null ? (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              minWidth: 0,
            }}
          >
            <span
              data-testid="kanban-score"
              style={{
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -1,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                color,
              }}
            >
              {displayedScore}
              <span style={{ fontSize: 12 }}>%</span>
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "#8a8a85" }}>
            Ainda não analisada
          </span>
        )}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {readOnly ? (
            <>
              <button
                type="button"
                onClick={onRestore}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 11px",
                  borderRadius: 8,
                  border: "1px solid rgba(10,10,10,0.14)",
                  background: "#fff",
                  color: "#0a0a0a",
                  fontFamily: GEIST,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Restaurar
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className="kb-icon-btn"
                  aria-label="Excluir candidatura"
                  title="Excluir"
                  onClick={onDelete}
                  style={{
                    width: 32,
                    height: 32,
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    color: "#991b1b",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              ) : null}
            </>
          ) : notAnalyzed ? (
            <Link
              href="/adaptar"
              draggable={false}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 32,
                padding: "0 11px",
                borderRadius: 8,
                background: "#0a0a0a",
                color: "#fafaf6",
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Analisar vaga
            </Link>
          ) : (
            <CvActionControl
              application={application}
              hasCredits={hasCredits}
              compact
            />
          )}
          {readOnly ? null : (
            <button
              type="button"
              className="kb-icon-btn"
              aria-label="Arquivar candidatura"
              title="Arquivar"
              onClick={onArchive}
              style={{
                width: 32,
                height: 32,
                border: 0,
                borderRadius: 8,
                background: "transparent",
                color: "#6a6560",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="5" rx="1.5" />
                <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
                <path d="M10 13h4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="Mover para"
          style={{
            position: "absolute",
            top: 46,
            right: 8,
            zIndex: 30,
            width: 210,
            background: "#fff",
            border: "1px solid rgba(10,10,10,0.10)",
            borderRadius: 12,
            boxShadow: "0 12px 28px -8px rgba(10,10,10,0.25)",
            padding: 6,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1,
              color: "#8a8a85",
              padding: "6px 8px 4px",
            }}
          >
            MOVER PARA
          </div>
          {BOARD_COLUMNS.filter((c) => c.key !== columnKey).map((column) => (
            <button
              key={column.key}
              type="button"
              role="menuitem"
              onClick={() => onMove(column.key as BoardColumnKey)}
              className="kb-icon-btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                minHeight: 36,
                padding: "0 8px",
                border: 0,
                borderRadius: 8,
                background: "transparent",
                fontFamily: GEIST,
                fontSize: 13,
                color: "#0a0a0a",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: column.accent,
                }}
              />
              {column.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function FinalizeDialog({
  application,
  onPick,
  onCancel,
}: {
  application: JobApplicationDto;
  onPick: (status: JobApplicationStatus) => void;
  onCancel: () => void;
}) {
  const { visible, close } = useDialogFade();
  const options: Array<{
    status: JobApplicationStatus;
    label: string;
    dot: string;
    highlight?: boolean;
  }> = [
    { status: "HIRED", label: "Contratado", dot: "#7aa811", highlight: true },
    { status: "REJECTED", label: "Recusado", dot: "#c0beb4" },
    { status: "WITHDRAWN", label: "Desistência", dot: "#c0beb4" },
  ];

  return (
    <div style={fadeOverlayStyle(visible)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-finalize-title"
        style={fadeDialogStyle(visible)}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: "#8a8a85",
            marginBottom: 6,
          }}
        >
          FINALIZAR CANDIDATURA
        </div>
        <h2
          id="kb-finalize-title"
          style={{
            margin: "0 0 4px",
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: -0.4,
          }}
        >
          Como terminou?
        </h2>
        <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6a6560" }}>
          {application.jobTitle} ·{" "}
          {getCompanyDisplayName(application.companyName)}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((option) => (
            <button
              key={option.status}
              type="button"
              onClick={() => close(() => onPick(option.status))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                padding: "0 14px",
                borderRadius: 10,
                border: option.highlight
                  ? "1px solid rgba(110,150,20,0.30)"
                  : "1px solid rgba(10,10,10,0.10)",
                background: option.highlight ? "rgba(198,255,58,0.18)" : "#fff",
                color: option.highlight ? "#3a5008" : "#0a0a0a",
                fontFamily: GEIST,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: option.dot,
                }}
              />
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => close(onCancel)}
          style={{
            marginTop: 12,
            width: "100%",
            height: 40,
            border: 0,
            background: "transparent",
            color: "#6a6560",
            fontFamily: GEIST,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancelar — o card volta para onde estava
        </button>
      </div>
    </div>
  );
}

function DeleteDialog({
  application,
  onConfirm,
  onCancel,
}: {
  application: JobApplicationDto;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { visible, close } = useDialogFade();
  return (
    <div style={fadeOverlayStyle(visible)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-delete-title"
        style={fadeDialogStyle(visible)}
      >
        <h2
          id="kb-delete-title"
          style={{
            margin: "0 0 6px",
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: -0.4,
          }}
        >
          Excluir candidatura?
        </h2>
        <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6a6560" }}>
          {application.jobTitle} ·{" "}
          {getCompanyDisplayName(application.companyName)}
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#45443e" }}>
          Ela sai da sua visão e não pode ser restaurada por você.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => close(onCancel)}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "#fff",
              color: "#3a3a36",
              fontFamily: GEIST,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => close(onConfirm)}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid #991b1b",
              background: "#991b1b",
              color: "#fff",
              fontFamily: GEIST,
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

function HiredPopup({
  application,
  onClose,
}: {
  application: JobApplicationDto;
  onClose: () => void;
}) {
  const { visible, close } = useDialogFade();
  return (
    <HiredCelebrationDialog
      mounted={visible}
      companyName={getCompanyDisplayName(application.companyName)}
      jobTitle={application.jobTitle}
      actions={
        <>
          <Link
            href={`/candidaturas/${application.id}`}
            style={{
              flex: 2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 0",
              borderRadius: 10,
              background: "#0a0a0a",
              color: "#fafaf6",
              fontSize: 13.5,
              fontWeight: 500,
              fontFamily: GEIST,
              textDecoration: "none",
            }}
          >
            Ver candidatura
          </Link>
          <button
            type="button"
            onClick={() => close(onClose)}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 10,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "rgba(255,255,255,0.7)",
              color: "#3a3a36",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: GEIST,
            }}
          >
            Fechar
          </button>
        </>
      }
    />
  );
}
