export interface Deck {
  id: string; name: string; total: number; due: number; isNew: number;
}
export interface Card {
  id: string; deck_id: string; front: string; back: string;
  is_reversed: number; ease: number; interval_days: number;
  reps: number; lapses: number; due: number;
}
export interface StudyItem extends Card {
  side: "forward" | "reverse"; q: string; a: string; deck_name: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as any).error ?? `Request failed ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  overview: () => req<{ total: number; decks: number; due: number; streak: number }>("/api/stats/overview"),
  decks: () => req<Deck[]>("/api/decks"),
  createDeck: (name: string) =>
    req<{ id: string }>("/api/decks", { method: "POST", body: JSON.stringify({ name }) }),
  deleteDeck: (id: string) => req(`/api/decks/${id}`, { method: "DELETE" }),
  deckCards: (id: string) => req<Card[]>(`/api/decks/${id}/cards`),
  createCard: (deckId: string, front: string, back: string, is_reversed: boolean) =>
    req(`/api/decks/${deckId}/cards`, {
      method: "POST",
      body: JSON.stringify({ front, back, is_reversed }),
    }),
  deleteCard: (id: string) => req(`/api/cards/${id}`, { method: "DELETE" }),
  queue: (deckId?: string, limit = 50) =>
    req<StudyItem[]>(`/api/study/queue?${deckId ? `deckId=${deckId}&` : ""}limit=${limit}`),
  review: (cardId: string, side: string, grade: number) =>
    req(`/api/study/review`, {
      method: "POST",
      body: JSON.stringify({ cardId, side, grade }),
    }),
};
