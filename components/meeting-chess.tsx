"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Crown, LoaderCircle, RotateCcw, X } from "lucide-react";
import { RoomEvent, type Room } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MeetingChessProps = {
  open: boolean;
  userName: string;
  onClose: () => void;
};

type ChessSyncMessage =
  | { type: "sync-request" }
  | {
      type: "sync-state" | "move" | "reset";
      fen: string;
      whiteId: string | null;
      blackId: string | null;
    };

const CHESS_TOPIC = "chess";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const PROMOTION_PIECES = ["q", "r", "b", "n"] as const;

const PIECE_GLYPHS: Record<string, Record<string, string>> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};

const PROMOTION_LABELS: Record<(typeof PROMOTION_PIECES)[number], string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
};

function encode(message: ChessSyncMessage) {
  return new TextEncoder().encode(JSON.stringify(message));
}

function decode(payload: Uint8Array): ChessSyncMessage | null {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as ChessSyncMessage;
  } catch {
    return null;
  }
}

function computeAssignment(room: Room) {
  const identities = [
    room.localParticipant.identity,
    ...Array.from(room.remoteParticipants.values()).map((p) => p.identity),
  ];
  const unique = Array.from(new Set(identities)).sort((a, b) =>
    a.localeCompare(b),
  );

  return { whiteId: unique[0] ?? null, blackId: unique[1] ?? null };
}

function participantLabel(room: Room, identity: string | null, localName: string) {
  if (!identity) return "Waiting for player…";
  if (identity === room.localParticipant.identity) return localName;

  const remote = Array.from(room.remoteParticipants.values()).find(
    (p) => p.identity === identity,
  );

  return remote?.name ?? remote?.identity ?? "Opponent";
}

export function MeetingChess({ open, userName, onClose }: MeetingChessProps) {
  const room = useRoomContext();
  const gameRef = useRef(new Chess());
  const hasRequestedSyncRef = useRef(false);
  const whiteIdRef = useRef<string | null>(null);
  const blackIdRef = useRef<string | null>(null);

  const [fen, setFen] = useState(() => gameRef.current.fen());
  const [whiteId, setWhiteId] = useState<string | null>(null);
  const [blackId, setBlackId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  useEffect(() => {
    whiteIdRef.current = whiteId;
    blackIdRef.current = blackId;
  }, [whiteId, blackId]);

  useEffect(() => {
    function handleData(payload: Uint8Array, _participant: unknown, _kind: unknown, topic?: string) {
      if (topic !== CHESS_TOPIC) return;

      const message = decode(payload);
      if (!message) return;

      if (message.type === "sync-request") {
        const assignment =
          whiteIdRef.current || blackIdRef.current
            ? { whiteId: whiteIdRef.current, blackId: blackIdRef.current }
            : null;

        if (!assignment) return;

        void room.localParticipant.publishData(
          encode({
            type: "sync-state",
            fen: gameRef.current.fen(),
            whiteId: assignment.whiteId,
            blackId: assignment.blackId,
          }),
          { reliable: true, topic: CHESS_TOPIC },
        );
        return;
      }

      if (message.type === "reset") {
        gameRef.current = new Chess();
      } else {
        gameRef.current.load(message.fen);
      }

      setFen(gameRef.current.fen());
      setWhiteId(message.whiteId);
      setBlackId(message.blackId);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setIsSyncing(false);
    }

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  useEffect(() => {
    if (!open || hasRequestedSyncRef.current) return;
    hasRequestedSyncRef.current = true;

    void room.localParticipant.publishData(encode({ type: "sync-request" }), {
      reliable: true,
      topic: CHESS_TOPIC,
    });

    const timeoutId = setTimeout(() => {
      if (whiteIdRef.current || blackIdRef.current) return;

      const assignment = computeAssignment(room);
      setWhiteId(assignment.whiteId);
      setBlackId(assignment.blackId);
      setIsSyncing(false);
      void room.localParticipant.publishData(
        encode({
          type: "sync-state",
          fen: gameRef.current.fen(),
          whiteId: assignment.whiteId,
          blackId: assignment.blackId,
        }),
        { reliable: true, topic: CHESS_TOPIC },
      );
    }, 900);

    return () => clearTimeout(timeoutId);
  }, [open, room]);

  const boardGame = useMemo(() => new Chess(fen), [fen]);

  const localIdentity = room.localParticipant.identity;
  const localColor: "w" | "b" | null =
    whiteId === localIdentity ? "w" : blackId === localIdentity ? "b" : null;
  const turn = boardGame.turn();
  const isMyTurn = localColor === turn;

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return new Set<Square>();

    const moves = boardGame.moves({ square: selectedSquare, verbose: true });
    return new Set(moves.map((move) => move.to as Square));
  }, [selectedSquare, boardGame]);

  const statusText = useMemo(() => {
    if (boardGame.isCheckmate()) {
      return `Checkmate — ${turn === "w" ? "Black" : "White"} wins`;
    }
    if (boardGame.isStalemate()) return "Stalemate — draw";
    if (boardGame.isDraw()) return "Draw";

    const turnLabel = turn === "w" ? "White" : "Black";
    return `${turnLabel} to move${boardGame.isCheck() ? " (check)" : ""}`;
  }, [boardGame, turn]);

  const isGameOver = boardGame.isGameOver();

  function broadcastMove() {
    void room.localParticipant.publishData(
      encode({
        type: "move",
        fen: gameRef.current.fen(),
        whiteId: whiteIdRef.current,
        blackId: blackIdRef.current,
      }),
      { reliable: true, topic: CHESS_TOPIC },
    );
  }

  function commitMove(from: Square, to: Square, promotion?: string) {
    const moveResult = gameRef.current.move({ from, to, promotion });
    if (!moveResult) return;

    setFen(gameRef.current.fen());
    setSelectedSquare(null);
    setPendingPromotion(null);
    broadcastMove();
  }

  function handleSquareClick(square: Square) {
    if (!localColor || !isMyTurn || isGameOver || pendingPromotion) return;

    const piece = boardGame.get(square);

    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      if (legalTargets.has(square)) {
        const movingPiece = boardGame.get(selectedSquare);
        const isPromotion =
          movingPiece?.type === "p" &&
          ((movingPiece.color === "w" && square.endsWith("8")) ||
            (movingPiece.color === "b" && square.endsWith("1")));

        if (isPromotion) {
          setPendingPromotion({ from: selectedSquare, to: square });
          return;
        }

        commitMove(selectedSquare, square);
        return;
      }

      if (piece && piece.color === localColor) {
        setSelectedSquare(square);
        return;
      }

      setSelectedSquare(null);
      return;
    }

    if (piece && piece.color === localColor) {
      setSelectedSquare(square);
    }
  }

  function handleReset() {
    gameRef.current = new Chess();
    const assignment = computeAssignment(room);

    setFen(gameRef.current.fen());
    setWhiteId(assignment.whiteId);
    setBlackId(assignment.blackId);
    setSelectedSquare(null);
    setPendingPromotion(null);

    void room.localParticipant.publishData(
      encode({
        type: "reset",
        fen: gameRef.current.fen(),
        whiteId: assignment.whiteId,
        blackId: assignment.blackId,
      }),
      { reliable: true, topic: CHESS_TOPIC },
    );
  }

  const whiteLabel = participantLabel(room, whiteId, userName);
  const blackLabel = participantLabel(room, blackId, userName);
  const panelClasses =
    "flex h-full min-h-[28rem] flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card/85 shadow-xl shadow-black/10 backdrop-blur";

  return (
    <>
      <aside className={cn(panelClasses, open ? "hidden xl:flex" : "hidden")}>
        <ChessPanelContent
          whiteLabel={whiteLabel}
          blackLabel={blackLabel}
          statusText={statusText}
          isSyncing={isSyncing}
          localColor={localColor}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          pendingPromotion={pendingPromotion}
          game={boardGame}
          onSquareClick={handleSquareClick}
          onPromote={(piece) => {
            if (!pendingPromotion) return;
            commitMove(pendingPromotion.from, pendingPromotion.to, piece);
          }}
          onCancelPromotion={() => setPendingPromotion(null)}
          onReset={handleReset}
          onClose={onClose}
          showCloseButton={false}
        />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/78 p-4 backdrop-blur-sm xl:hidden">
          <div className={cn(panelClasses, "mx-auto h-full max-w-md")}>
            <ChessPanelContent
              whiteLabel={whiteLabel}
              blackLabel={blackLabel}
              statusText={statusText}
              isSyncing={isSyncing}
              localColor={localColor}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              pendingPromotion={pendingPromotion}
              game={boardGame}
              onSquareClick={handleSquareClick}
              onPromote={(piece) => {
                if (!pendingPromotion) return;
                commitMove(pendingPromotion.from, pendingPromotion.to, piece);
              }}
              onCancelPromotion={() => setPendingPromotion(null)}
              onReset={handleReset}
              onClose={onClose}
              showCloseButton
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChessPanelContent({
  whiteLabel,
  blackLabel,
  statusText,
  isSyncing,
  localColor,
  selectedSquare,
  legalTargets,
  pendingPromotion,
  game,
  onSquareClick,
  onPromote,
  onCancelPromotion,
  onReset,
  onClose,
  showCloseButton,
}: {
  whiteLabel: string;
  blackLabel: string;
  statusText: string;
  isSyncing: boolean;
  localColor: "w" | "b" | null;
  selectedSquare: Square | null;
  legalTargets: Set<Square>;
  pendingPromotion: { from: Square; to: Square } | null;
  game: Chess;
  onSquareClick: (square: Square) => void;
  onPromote: (piece: (typeof PROMOTION_PIECES)[number]) => void;
  onCancelPromotion: () => void;
  onReset: () => void;
  onClose: () => void;
  showCloseButton: boolean;
}) {
  const orientedRanks = localColor === "b" ? [...RANKS].reverse() : RANKS;
  const orientedFiles = localColor === "b" ? [...FILES].reverse() : FILES;

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Crown className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">Chess</p>
            <h2 className="text-base font-semibold tracking-tight">
              {isSyncing ? "Syncing…" : statusText}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onReset}
            aria-label="Reset game"
            title="Reset game"
          >
            <RotateCcw className="size-4" />
          </Button>
          {showCloseButton ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={onClose}
              aria-label="Close chess"
            >
              <X className="size-5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1",
            game.turn() === "b"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/70",
          )}
        >
          ♚ {blackLabel}
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1",
            game.turn() === "w"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/70",
          )}
        >
          ♔ {whiteLabel}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto px-4 py-3">
        {isSyncing ? (
          <LoaderCircle className="size-8 animate-spin text-primary" />
        ) : (
          <div className="grid aspect-square w-full max-w-sm grid-cols-8 overflow-hidden rounded-xl border border-border/70 shadow-inner">
            {orientedRanks.map((rank) =>
              orientedFiles.map((file) => {
                const square = `${file}${rank}` as Square;
                const piece = game.get(square);
                const isDark = (FILES.indexOf(file) + rank) % 2 === 0;
                const isSelected = selectedSquare === square;
                const isLegalTarget = legalTargets.has(square);
                const isPromotionTarget =
                  pendingPromotion && pendingPromotion.to === square;

                return (
                  <button
                    key={square}
                    type="button"
                    onClick={() => onSquareClick(square)}
                    className={cn(
                      "relative flex aspect-square items-center justify-center text-2xl transition-colors sm:text-3xl",
                      isDark ? "bg-primary/15" : "bg-card",
                      isSelected && "bg-primary/40",
                      !isSelected && isLegalTarget && "after:absolute after:size-2.5 after:rounded-full after:bg-primary/60 sm:after:size-3",
                    )}
                    aria-label={square}
                  >
                    {piece ? (
                      <span
                        className={cn(
                          piece.color === "w"
                            ? "text-foreground drop-shadow-sm"
                            : "text-foreground/80",
                        )}
                      >
                        {PIECE_GLYPHS[piece.color][piece.type]}
                      </span>
                    ) : null}

                    {isPromotionTarget ? (
                      <div className="absolute inset-x-0 top-full z-10 mt-1 flex -translate-y-full flex-col gap-1 rounded-xl border border-border/70 bg-card p-1 shadow-xl">
                        {PROMOTION_PIECES.map((promotionPiece) => (
                          <button
                            key={promotionPiece}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onPromote(promotionPiece);
                            }}
                            className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-accent"
                            title={PROMOTION_LABELS[promotionPiece]}
                          >
                            {PIECE_GLYPHS[localColor ?? "w"][promotionPiece]}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCancelPromotion();
                          }}
                          className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </button>
                );
              }),
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/70 px-5 py-3 text-center text-xs text-muted-foreground">
        {localColor
          ? `You are playing ${localColor === "w" ? "White" : "Black"}.`
          : "You're spectating this game."}
      </div>
    </>
  );
}
