import { FormEvent, useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';

type Player = {
  id: string;
  name: string;
  character: string;
  startingBalance: number;
};

type Bet = {
  targetId: string;
  amount: number;
};

type MatchResult = {
  winnerId: string;
  payout: Record<string, number>;
  net: Record<string, number>;
  totalBet: number;
  totalWinnerBet: number;
};

type Match = {
  id: string;
  playerAId: string;
  playerBId: string;
  bets: Record<string, Bet>;
  result?: MatchResult;
  betsLocked?: boolean;
};

type Game = {
  id: string;
  name: string;
  buyInAmount: number;
  players: Player[];
  matches: Match[];
  rounds: Match[][];
  currentRound: number;
  date?: string;
};

const STORAGE_KEY = 'bloodsportGames';
const LEGACY_STORAGE_KEY = 'esotereciiGames';

const emptyGameForm = { name: '', buyInAmount: '' };
const emptyPlayerForm = { name: '', character: '' };

function readStoredGames(): Game[] {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current) as Game[];
      return parsed.map((game) => ({
        ...game,
        buyInAmount: typeof game.buyInAmount === 'number' ? game.buyInAmount : 0,
        rounds: Array.isArray(game.rounds) ? game.rounds : [],
        currentRound: typeof game.currentRound === 'number' ? game.currentRound : 1,
        players: (game.players ?? []).map((player) => ({
          ...player,
          startingBalance: typeof player.startingBalance === 'number' ? player.startingBalance : game.buyInAmount ?? 0,
        })),
      }));
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      return JSON.parse(legacy) as Game[];
    }
  } catch {
    // fall through to empty list
  }

  return [];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createMatch(playerAId: string, playerBId: string, playerIds: string[]): Match {
  const bets: Record<string, Bet> = {};
  playerIds.forEach((playerId) => {
    bets[playerId] = { targetId: playerAId, amount: 0 };
  });

  return {
    id: `${playerAId}-${playerBId}-${Date.now()}`,
    playerAId,
    playerBId,
    bets,
  };
}

function createRoundMatches(playerIds: string[], previousRounds: Match[][]): Match[] {
  const shuffledIds = shuffle([...playerIds]);
  const previousOpponents = new Map<string, Set<string>>();

  previousRounds.forEach((roundMatches) => {
    roundMatches.forEach((match) => {
      const addOpponent = (playerId: string, opponentId: string) => {
        const opponents = previousOpponents.get(playerId) ?? new Set<string>();
        opponents.add(opponentId);
        previousOpponents.set(playerId, opponents);
      };

      addOpponent(match.playerAId, match.playerBId);
      addOpponent(match.playerBId, match.playerAId);
    });
  });

  const canFace = (playerId: string, opponentId: string) => !previousOpponents.get(playerId)?.has(opponentId);

  const pairs: Array<[string, string]> = [];
  const remainingIds = [...shuffledIds];

  const search = (ids: string[], currentPairs: Array<[string, string]>): Array<[string, string]> | null => {
    if (ids.length === 0) {
      return currentPairs;
    }

    const playerId = ids[0];
    const availableOpponents = shuffle(ids.slice(1).filter((opponentId) => canFace(playerId, opponentId)));

    for (const opponentId of availableOpponents) {
      const nextIds = ids.filter((candidateId) => candidateId !== playerId && candidateId !== opponentId);
      const result = search(nextIds, [...currentPairs, [playerId, opponentId]]);
      if (result) {
        return result;
      }
    }

    return null;
  };

  const foundPairs = search(remainingIds, []);
  if (!foundPairs) {
    return [];
  }

  return foundPairs.map(([playerAId, playerBId]) => createMatch(playerAId, playerBId, playerIds));
}

function App() {
  const [games, setGames] = useState<Game[]>(() => readStoredGames());
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameForm, setGameForm] = useState(emptyGameForm);
  const [playerForm, setPlayerForm] = useState(emptyPlayerForm);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<'gameName' | 'playerName' | 'matchSummary' | 'matchDetail' | null>(null);
  const playerNameRef = useRef<HTMLInputElement | null>(null);
  const gameNameRef = useRef<HTMLInputElement | null>(null);
  const matchesListRef = useRef<HTMLDivElement | null>(null);
  const matchDetailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    } catch {
      // ignore storage errors
    }
  }, [games]);

  // Manage keyboard focus when switching between pages.
  // This is driven by an explicit focus target so it works reliably even when the view changes quickly.
  useLayoutEffect(() => {
    if (!focusTarget) {
      return;
    }

    const timer = window.setTimeout(() => {
      switch (focusTarget) {
        case 'gameName':
          gameNameRef.current?.focus();
          break;
        case 'playerName':
          playerNameRef.current?.focus();
          break;
        case 'matchSummary': {
          const game = games.find((item) => item.id === selectedGameId) ?? null;
          if (!game || game.matches.length === 0) {
            playerNameRef.current?.focus();
            break;
          }
          const firstMatch = matchesListRef.current?.querySelector<HTMLButtonElement>('.match-summary');
          firstMatch?.focus();
          break;
        }
        case 'matchDetail': {
          const container = matchDetailRef.current;
          if (!container) {
            break;
          }
          const focusable = container.querySelector<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          focusable?.focus();
          break;
        }
        default:
          break;
      }

      setFocusTarget(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusTarget, games, selectedGameId, selectedMatchId]);

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId]
  );
  const [viewRound, setViewRound] = useState<number | null>(null);

  // Sync URL with state when selecting game or match
  useEffect(() => {
    if (!selectedGameId) {
      return;
    }

    const buildUrl = () => {
      if (!selectedMatchId) {
        if (viewRound && viewRound !== selectedGame?.currentRound) {
          return `/game/${selectedGameId}/round/${viewRound}`;
        }
        return `/game/${selectedGameId}`;
      }
      return `/game/${selectedGameId}/match/${selectedMatchId}`;
    };
    const url = buildUrl();
    try {
      window.history.pushState({ selectedGameId, selectedMatchId, viewRound }, '', url);
    } catch (e) {
      // ignore
    }
  }, [selectedGameId, selectedMatchId, selectedGame, viewRound]);

  // Handle back/forward navigation
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      const parts = path.replace(/^\//, '').split('/');
      if (parts[0] === 'game' && parts[1]) {
        setSelectedGameId(parts[1]);
        if (parts[2] === 'match' && parts[3]) {
          setSelectedMatchId(parts[3]);
          setFocusTarget('matchDetail');
        } else {
          setSelectedMatchId(null);
          if (parts[2] === 'round' && parts[3]) {
            const roundNumber = Number(parts[3]);
            if (!Number.isNaN(roundNumber) && roundNumber > 0) {
              setViewRound(roundNumber);
            } else {
              setViewRound(null);
            }
          } else {
            setViewRound(null);
          }
          setFocusTarget('matchSummary');
        }
      } else {
        setSelectedGameId(null);
        setSelectedMatchId(null);
        setViewRound(null);
        setFocusTarget('gameName');
      }
    };

    window.addEventListener('popstate', onPop);
    // also run once on mount to catch URLs on page load
    onPop();
    return () => window.removeEventListener('popstate', onPop);
  }, []);


  const updateGame = (updated: Game) => {
    setGames((current) => current.map((game) => (game.id === updated.id ? updated : game)));
  };

  const updateMatchInGame = (game: Game, matchId: string, updater: (match: Match) => Match) => {
    const currentMatchIndex = game.matches.findIndex((match) => match.id === matchId);
    if (currentMatchIndex >= 0) {
      const currentMatch = game.matches[currentMatchIndex];
      const nextMatch = updater(currentMatch);
      if (nextMatch === currentMatch) {
        return game;
      }

      const nextMatches = [...game.matches];
      nextMatches[currentMatchIndex] = nextMatch;
      return { ...game, matches: nextMatches };
    }

    let changed = false;
    const nextRounds = game.rounds.map((roundMatches) => {
      const roundMatchIndex = roundMatches.findIndex((match) => match.id === matchId);
      if (roundMatchIndex < 0) {
        return roundMatches;
      }

      const currentMatch = roundMatches[roundMatchIndex];
      const nextMatch = updater(currentMatch);
      if (nextMatch === currentMatch) {
        return roundMatches;
      }

      changed = true;
      const nextRoundMatches = [...roundMatches];
      nextRoundMatches[roundMatchIndex] = nextMatch;
      return nextRoundMatches;
    });

    return changed ? { ...game, rounds: nextRounds } : game;
  };

  const handleCreateGame = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = gameForm.name.trim();
    const buyInAmountInput = gameForm.buyInAmount.trim();
    const buyInAmount = buyInAmountInput === '' ? 0 : Number(buyInAmountInput);

    if (!name || Number.isNaN(buyInAmount) || buyInAmount < 0) {
      return;
    }

    const newGame: Game = {
      id: `${Date.now()}`,
      name,
      buyInAmount,
      players: [],
      matches: [],
      rounds: [],
      currentRound: 1,
    };

    setGames((current) => [...current, newGame]);
    setSelectedGameId(newGame.id);
    setSelectedMatchId(null);
    setGameForm(emptyGameForm);
    setFocusTarget('playerName');
  };

  const handleAddPlayer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGame) {
      return;
    }

    const name = playerForm.name.trim();
    const character = playerForm.character.trim();
    if (!name || !character) {
      return;
    }

    const newPlayer: Player = {
      id: `${Date.now()}-${name}`,
      name,
      character,
      startingBalance: selectedGame.buyInAmount ?? 0,
    };

    const updatedGame = {
      ...selectedGame,
      players: [...selectedGame.players, newPlayer],
    };

    updateGame(updatedGame);
    setPlayerForm(emptyPlayerForm);
    setFocusTarget('playerName');
  };

  const handleRandomizeMatches = () => {
    if (!selectedGame) {
      return;
    }

    // Prevent re-randomizing after matches have been created
    if (selectedGame.matches && selectedGame.matches.length > 0) {
      alert('Matches already randomized for this game.');
      return;
    }

    if (selectedGame.players.length < 2) {
      return;
    }

    if (selectedGame.players.length % 2 !== 0) {
      alert('Add one more player before randomizing matches so every player can be paired.');
      return;
    }

    const matches = createRoundMatches(selectedGame.players.map((player) => player.id), []);
    if (matches.length === 0) {
      alert('Could not build a valid set of pairings for this round.');
      return;
    }

    updateGame({ ...selectedGame, matches, rounds: [], currentRound: 1 });
    setFocusTarget('matchSummary');
    // push url to indicate matches list now present
    try {
      window.history.pushState({ selectedGameId }, '', `/game/${selectedGame.id}`);
    } catch (e) {
      // ignore
    }
  };

  const handleBetUpdate = (
    matchId: string,
    bettorId: string,
    field: keyof Bet,
    value: string | number
  ) => {
    if (!selectedGame) {
      return;
    }

    const updatedGame = updateMatchInGame(selectedGame, matchId, (match) => {
      if (match.id !== matchId || match.result || match.betsLocked) {
        return match;
      }

      const existing = match.bets[bettorId] || { targetId: match.playerAId, amount: 0 };
      const nextBet = {
        ...existing,
        [field]: field === 'amount' ? Number(value) : String(value),
      } as Bet;

      return {
        ...match,
        bets: {
          ...match.bets,
          [bettorId]: nextBet,
        },
      };
    });

    if (updatedGame !== selectedGame) {
      updateGame(updatedGame);
    }
  };

  const handleSaveBets = (matchId: string) => {
    if (!selectedGame) {
      return;
    }

    const updatedGame = updateMatchInGame(selectedGame, matchId, (match) => {
      if (match.id !== matchId) {
        return match;
      }

      return {
        ...match,
        betsLocked: true,
      };
    });

    if (updatedGame !== selectedGame) {
      updateGame(updatedGame);
    }
  };

  const handleEditBets = (matchId: string) => {
    if (!selectedGame) {
      return;
    }

    const updatedGame = updateMatchInGame(selectedGame, matchId, (match) => {
      if (match.id !== matchId) {
        return match;
      }

      return {
        ...match,
        betsLocked: false,
      };
    });

    if (updatedGame !== selectedGame) {
      updateGame(updatedGame);
    }
  };

  const computeMatchResult = (match: Match, winnerId: string) => {
    const bets = match.bets;
    const totalBet = Object.values(bets).reduce((sum, bet) => sum + (bet.amount || 0), 0);
    const totalWinnerBet = Object.values(bets).reduce(
      (sum, bet) => sum + (bet.targetId === winnerId ? bet.amount : 0),
      0
    );

    const payout: Record<string, number> = {};
    const net: Record<string, number> = {};

    Object.entries(bets).forEach(([bettorId, bet]) => {
      const betAmount = bet.amount || 0;
      if (betAmount <= 0) {
        payout[bettorId] = 0;
        net[bettorId] = 0;
        return;
      }

      if (bet.targetId === winnerId && totalWinnerBet > 0) {
        const winningPayout = (betAmount / totalWinnerBet) * totalBet;
        payout[bettorId] = Number(winningPayout.toFixed(2));
        net[bettorId] = Number((winningPayout - betAmount).toFixed(2));
      } else {
        payout[bettorId] = 0;
        net[bettorId] = -betAmount;
      }
    });

    const loserId = match.playerAId === winnerId ? match.playerBId : match.playerBId === winnerId ? match.playerAId : null;
    if (loserId) {
      net[winnerId] = Number(((net[winnerId] ?? 0) + 20).toFixed(2));
      net[loserId] = Number(((net[loserId] ?? 0) + 10).toFixed(2));
    }

    return {
      winnerId,
      payout,
      net,
      totalBet,
      totalWinnerBet,
    };
  };

  const handleSetWinner = (matchId: string, winnerId: string) => {
    if (!selectedGame) {
      return;
    }

    const updatedGame = updateMatchInGame(selectedGame, matchId, (match) => {
      if (match.id !== matchId || match.result || !match.betsLocked) {
        return match;
      }

      const result = computeMatchResult(match, winnerId);
      return { ...match, result };
    });

    if (updatedGame !== selectedGame) {
      updateGame(updatedGame);
    }
  };

  const handleCreateNextRound = () => {
    if (!selectedGame) {
      return;
    }

    const hasIncompleteMatches = selectedGame.matches.some((match) => !match.result);
    if (hasIncompleteMatches) {
      alert('Finish the current round before starting a new one.');
      return;
    }

    if (!confirm('Start a new round?')) {
      return;
    }

    const nextMatches = createRoundMatches(
      selectedGame.players.map((player) => player.id),
      [...selectedGame.rounds, selectedGame.matches]
    );

    if (nextMatches.length === 0) {
      alert('Could not build a valid set of pairings for the next round.');
      return;
    }

    const nextRoundNumber = selectedGame.currentRound + 1;
    updateGame({
      ...selectedGame,
      rounds: [...selectedGame.rounds, selectedGame.matches],
      matches: nextMatches,
      currentRound: nextRoundNumber,
    });
    setViewRound(nextRoundNumber);
    setFocusTarget('matchSummary');
    try {
      window.history.pushState({ selectedGameId }, '', `/game/${selectedGame.id}`);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!selectedGame) {
      return;
    }

    if (viewRound === null || viewRound > selectedGame.currentRound || viewRound < 1) {
      setViewRound(selectedGame.currentRound);
    }
  }, [selectedGame, viewRound]);

  useEffect(() => {
    if (!selectedGame || viewRound === null) {
      return;
    }

    const url = viewRound === selectedGame.currentRound
      ? `/game/${selectedGame.id}`
      : `/game/${selectedGame.id}/round/${viewRound}`;

    try {
      window.history.replaceState({ selectedGameId, selectedMatchId, viewRound }, '', url);
    } catch (e) {
      // ignore
    }
  }, [selectedGame, selectedGameId, selectedMatchId, viewRound]);

  const canGoToPreviousRound = Boolean(selectedGame && viewRound !== null && viewRound > 1);
  const canGoToCurrentRound = Boolean(selectedGame && viewRound !== null && viewRound !== selectedGame.currentRound);
  const canGoToNextRound = Boolean(selectedGame && viewRound !== null && selectedGame.currentRound > 2 && viewRound < selectedGame.currentRound - 1);

  const leaderboard = useMemo(() => {
    if (!selectedGame) {
      return [];
    }

    const balances: Record<string, number> = {};
    selectedGame.players.forEach((player) => {
      balances[player.id] = player.startingBalance ?? 0;
    });

    const allMatches = [...selectedGame.rounds.flat(), ...selectedGame.matches];
    allMatches.forEach((match) => {
      if (!match.result) {
        return;
      }
      Object.entries(match.result.net).forEach(([bettorId, value]) => {
        balances[bettorId] = Number(((balances[bettorId] || 0) + value).toFixed(2));
      });
    });

    return selectedGame.players
      .map((player) => ({
        player,
        balance: Number((balances[player.id] || 0).toFixed(2)),
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [selectedGame]);

  const handleDeleteGame = (gameId: string) => {
    if (!confirm('Delete this game? This cannot be undone.')) return;
    setGames((current) => current.filter((g) => g.id !== gameId));
    if (selectedGameId === gameId) {
      setSelectedGameId(null);
      setSelectedMatchId(null);
      setFocusTarget('gameName');
      try { window.history.pushState({}, '', '/'); } catch (e) {}
    }
  };

  const renderGameList = () => (
    <section className="card">
      <h2>Create a Game</h2>
      <form onSubmit={handleCreateGame} className="form-grid">
        <label>
          Game name
          <input
            ref={gameNameRef}
            value={gameForm.name}
            onChange={(event) => setGameForm({ ...gameForm, name: event.target.value })}
            placeholder="Bloodsport Session"
            aria-label="Game name"
          />
        </label>
        <label>
          Buy-in amount (optional)
          <input
            type="number"
            min={0}
            step="0.01"
            value={gameForm.buyInAmount}
            onChange={(event) => setGameForm({ ...gameForm, buyInAmount: event.target.value })}
            placeholder="0.00"
            aria-label="Buy-in amount"
          />
        </label>
        <button type="submit" className="btn">Start Game</button>
      </form>

      {games.length > 0 && (
        <div className="section">
          <h3>Saved games</h3>
          <div className="game-list">
            {games.map((game) => (
              <div key={game.id} className="game-row">
                <button
                  className="game-card"
                  onClick={() => {
                    const targetGame = games.find((item) => item.id === game.id) ?? null;
                    setSelectedGameId(game.id);
                    setSelectedMatchId(null);
                    setFocusTarget(targetGame && targetGame.matches.length > 0 ? 'matchSummary' : 'playerName');
                  }}
                >
                  <strong>{game.name}</strong>
                  <span>{game.buyInAmount != null ? `Buy-in: $${game.buyInAmount.toFixed(2)}` : 'Buy-in: $0.00'}</span>
                </button>
                <button className="btn small danger icon-btn" onClick={() => handleDeleteGame(game.id)} aria-label={`Delete ${game.name}`}>
                  X
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );

  const renderMatch = (match: Match) => {
    const playerA = selectedGame?.players.find((player) => player.id === match.playerAId);
    const playerB = selectedGame?.players.find((player) => player.id === match.playerBId);
    if (!selectedGame || !playerA || !playerB) {
      return null;
    }

    const matchLabel = `${playerA.name} as ${playerA.character} vs ${playerB.name} as ${playerB.character}`;
    const isCompleted = Boolean(match.result);
    const activeBettorCount = Object.values(match.bets).filter((bet) => (bet.amount || 0) > 0).length;
    const bettorCountOnPlayerA = Object.values(match.bets).filter((bet) => bet.targetId === match.playerAId && (bet.amount || 0) > 0).length;
    const bettorCountOnPlayerB = Object.values(match.bets).filter((bet) => bet.targetId === match.playerBId && (bet.amount || 0) > 0).length;

    return (
      <button
        key={match.id}
        type="button"
        className="match-card match-summary"
        onClick={() => {
          setSelectedMatchId(match.id);
          setFocusTarget('matchDetail');
        }}
        aria-label={`Open match details for ${playerA.name} as ${playerA.character} vs ${playerB.name} as ${playerB.character}`}
      >
        <div className="match-header">
          <div>
            <h3>{matchLabel}</h3>
            <p className={isCompleted ? 'tag completed' : 'tag upcoming'}>
              {isCompleted
                ? `Finished: ${selectedGame.players.find((player) => player.id === match.result?.winnerId)?.name ?? 'Winner'}`
                : 'Upcoming'}
            </p>
            <p className="muted">
              {bettorCountOnPlayerA}:{bettorCountOnPlayerB}
            </p>
          </div>
        </div>
      </button>
    );
  };

  const roundMatches = useMemo(() => {
    if (!selectedGame || viewRound === null) {
      return [];
    }

    if (viewRound === selectedGame.currentRound) {
      return selectedGame.matches;
    }

    return selectedGame.rounds[viewRound - 1] ?? [];
  }, [selectedGame, viewRound]);

  const displayedRoundCount = selectedGame ? Math.max(1, selectedGame.currentRound) : 1;

  const renderMatchDetail = (match: Match) => {
    const playerA = selectedGame?.players.find((player) => player.id === match.playerAId);
    const playerB = selectedGame?.players.find((player) => player.id === match.playerBId);
    if (!selectedGame || !playerA || !playerB) {
      return null;
    }

    const isCompleted = Boolean(match.result);
    const isLocked = Boolean(match.betsLocked);
    const totalBet = Object.values(match.bets).reduce((sum, bet) => sum + (bet.amount || 0), 0);
    const betsOnPlayerA = Object.values(match.bets).reduce((sum, bet) => sum + (bet.targetId === match.playerAId ? (bet.amount || 0) : 0), 0);
    const betsOnPlayerB = Object.values(match.bets).reduce((sum, bet) => sum + (bet.targetId === match.playerBId ? (bet.amount || 0) : 0), 0);
    const bettorCountOnPlayerA = Object.values(match.bets).filter((bet) => bet.targetId === match.playerAId && (bet.amount || 0) > 0).length;
    const bettorCountOnPlayerB = Object.values(match.bets).filter((bet) => bet.targetId === match.playerBId && (bet.amount || 0) > 0).length;
    const displayTotalBet = isCompleted && match.result ? match.result.totalBet : totalBet;

    return (
      <section className="card match-detail-page" ref={matchDetailRef}>
        <div className="match-header">
          <div>
            <h2>{`${playerA.name} as ${playerA.character} vs ${playerB.name} as ${playerB.character}`}</h2>
            <p className={isCompleted ? 'tag completed' : 'tag upcoming'}>
              {isCompleted ? 'Finished' : 'Upcoming'}
            </p>
          </div>
          <div className="match-actions">
            {!isCompleted && (
              <>
                {!isLocked ? (
                  <button type="button" className="btn" onClick={() => handleSaveBets(match.id)}>
                    Save Bets
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn" onClick={() => handleEditBets(match.id)}>
                      Edit Bets
                    </button>
                    <button type="button" className="btn primary" onClick={() => handleSetWinner(match.id, match.playerAId)}>
                      Mark {playerA.name} as {playerA.character} Winner
                    </button>
                    <button type="button" className="btn primary" onClick={() => handleSetWinner(match.id, match.playerBId)}>
                      Mark {playerB.name} as {playerB.character} Winner
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="section">
          <h3>{isCompleted ? 'Results' : 'Bets'}</h3>
          {(isCompleted && match.result) || !isCompleted ? (
            <div className="summary-card">
              <div><strong>Total pot:</strong> ${displayTotalBet.toFixed(2)}</div>
              <div><strong>{playerA.name} as {playerA.character} total:</strong> ${betsOnPlayerA.toFixed(2)} ({bettorCountOnPlayerA} bettor{bettorCountOnPlayerA === 1 ? '' : 's'})</div>
              <div><strong>{playerB.name} as {playerB.character} total:</strong> ${betsOnPlayerB.toFixed(2)} ({bettorCountOnPlayerB} bettor{bettorCountOnPlayerB === 1 ? '' : 's'})</div>
              {isCompleted && match.result && (
                <div><strong>Winner:</strong> {selectedGame.players.find((player) => player.id === match.result?.winnerId)?.name ?? 'Winner'}</div>
              )}
            </div>
          ) : null}
          <div className="bets-list">
            {selectedGame.players.map((bettor) => {
              const bet = match.bets[bettor.id] || { targetId: match.playerAId, amount: 0 };
              const inMatch = bettor.id === match.playerAId || bettor.id === match.playerBId;
              const target = selectedGame.players.find((player) => player.id === bet.targetId);
              const payout = match.result?.payout[bettor.id] ?? 0;
              const net = match.result?.net[bettor.id] ?? 0;

              return (
                <div className={`bet-card ${inMatch ? 'in-match' : ''}`} key={bettor.id}>
                  <div className="bettor-name">{inMatch ? '⚔️' : ''} {bettor.name} as {bettor.character}</div>
                  {isCompleted ? (
                    <>
                      <div className="bet-field">
                        <span className="field-label">Staked</span>
                        <span>${bet.amount.toFixed(2)}</span>
                      </div>
                      <div className="bet-field">
                        <span className="field-label">Picked</span>
                        <span>{target?.name ?? 'Unknown'}</span>
                      </div>
                      <div className="bet-field">
                        <span className="field-label">Payout</span>
                        <span>${payout.toFixed(2)}</span>
                      </div>
                      <div className="bet-field">
                        <span className="field-label">Net</span>
                        <span className={net >= 0 ? 'positive' : 'negative'}>${net.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="bet-field">
                        <span className="field-label">Amount</span>
                        <input
                          type="number"
                          min={0}
                          value={bet.amount || ''}
                          disabled={isLocked}
                          aria-label={`Amount for ${bettor.name}`}
                          onChange={(event) => handleBetUpdate(match.id, bettor.id, 'amount', event.target.value)}
                        />
                      </label>
                      <label className="bet-field">
                        <span className="field-label">Bet On</span>
                        <select
                          value={bet.targetId}
                          disabled={isLocked}
                          aria-label={`Bet target for ${bettor.name}`}
                          onChange={(event) => handleBetUpdate(match.id, bettor.id, 'targetId', event.target.value)}
                        >
                          <option value={playerA.id}>{playerA.name} as {playerA.character}</option>
                          <option value={playerB.id}>{playerB.name} as {playerB.character}</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </section>
    );
  };

  const renderSelectedGame = () => {
    if (!selectedGame) {
      return null;
    }

    // Page 2: when a game is selected and no match is selected
    const activeMatch = selectedMatchId
      ? roundMatches.find((m) => m.id === selectedMatchId) ?? null
      : null;
    const hasMatches = selectedGame.matches && selectedGame.matches.length > 0;

    // If a match is selected, render the match detail page (page 3)
    if (activeMatch) {
      return (
        <>
          <button
            className="btn back-button"
            type="button"
            onClick={() => {
              setSelectedMatchId(null);
              setFocusTarget('matchSummary');
            }}
          >
            ← Back to game
          </button>
          {renderMatchDetail(activeMatch)}
        </>
      );
    }

    // Page 2: Game overview. If matches exist for this game, focus on matches + leaderboard.
    // If matches do not exist, this is the 'setup' flow: add players and randomize.
    return (
      <>
        <button
          className="btn back-button"
          type="button"
          onClick={() => {
            setSelectedMatchId(null);
            setSelectedGameId(null);
            setFocusTarget('gameName');
            try {
              window.history.pushState({}, '', '/');
            } catch (e) {}
          }}
        >
          ← Back to games
        </button>

        <section className="card selected-game-card">
          <div className="game-header">
            <div>
              <h2>{selectedGame.name} (Round {viewRound ?? selectedGame.currentRound})</h2>
              <p>Buy-in: ${selectedGame.buyInAmount.toFixed(2)} each</p>
            </div>
          </div>

          {!hasMatches ? (
            // Setup view: add players and then randomize
            <div className="section">
              <h3>Players ({selectedGame.players.length})</h3>
              <form onSubmit={handleAddPlayer} className="form-grid small-grid inner-grid">
                <label>
                  Player name
                  <input
                    ref={playerNameRef}
                    value={playerForm.name}
                    onChange={(event) => setPlayerForm({ ...playerForm, name: event.target.value })}
                    placeholder="Player"
                    aria-label="Player name"
                  />
                </label>
                <label>
                  Character name
                  <input
                    value={playerForm.character}
                    onChange={(event) => setPlayerForm({ ...playerForm, character: event.target.value })}
                    placeholder="Character"
                    aria-label="Character name"
                  />
                </label>
                <button type="submit" className="btn">Add Player</button>
              </form>

              {selectedGame.players.length > 0 ? (
                <>
                  <ul className="entity-list">
                    {selectedGame.players.map((player) => (
                      <li className="entity-card" key={player.id}>
                        <div>{player.name} as <strong>{player.character}</strong></div>
                      </li>
                    ))}
                  </ul>

                  <div className="section-actions">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={handleRandomizeMatches}
                      aria-label="Randomize matches"
                      disabled={selectedGame.matches && selectedGame.matches.length > 0}
                    >
                      {selectedGame.matches && selectedGame.matches.length > 0 ? 'Matches randomized' : 'Randomize Matches'}
                    </button>
                  </div>
                </>
              ) : (
                <p>No players yet. Add players to start building matches.</p>
              )}
            </div>
          ) : (
            // Matches exist: show match list overview and leaderboard (primary), players are secondary
            <>
              <div className="section">
                <h3>Matches</h3>
                <div className="section-actions">
                {canGoToPreviousRound && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setViewRound((current) => (current ? current - 1 : 1))}
                  >
                    ← Previous Round
                  </button>
                )}
                {canGoToNextRound && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setViewRound((current) => (current ? current + 1 : 1))}
                  >
                    Next Round →
                  </button>
                )}
                {canGoToCurrentRound && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setViewRound(selectedGame.currentRound)}
                  >
                    Current Round →
                  </button>
                )}
                </div>
                <p className="muted">Viewing Round {viewRound ?? selectedGame.currentRound}. Tap a match to open its full view.</p>
                <div className="matches-list" ref={matchesListRef}>
                  {roundMatches.map((match) => renderMatch(match))}
                </div>
                {selectedGame.matches.length > 0 && selectedGame.matches.every((match) => match.result) && (
                  <div className="section-actions">
                    <button type="button" className="btn primary" onClick={handleCreateNextRound}>
                      Create Next Round
                    </button>
                  </div>
                )}
              </div>

              <div className="section">
                <h3>Leaderboard</h3>
                {leaderboard.length > 0 ? (
                  <ul className="entity-list">
                    {leaderboard.map(({ player, balance }) => (
                      <li className="entity-card" key={player.id}>
                        <div>{player.name} as <strong>{player.character}</strong></div>
                        <div className={`leader-net ${balance >= 0 ? 'positive' : 'negative'}`}><strong>${balance.toFixed(2)}</strong></div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No completed match payouts yet.</p>
                )}
              </div>
            </>
          )}
        </section>
      </>
    );
  };

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>Bloodsport GM App</h1>
          <p>Track matches, take bets, and compute payouts.</p>
        </div>
      </header>
      <main>{selectedGame ? renderSelectedGame() : renderGameList()}</main>
    </div>
  );
}

export default App;
