import { FormEvent, useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';

type Player = {
  id: string;
  name: string;
  character: string;
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
};

type Game = {
  id: string;
  name: string;
  date: string;
  players: Player[];
  matches: Match[];
};

const STORAGE_KEY = 'bloodsportGames';
const LEGACY_STORAGE_KEY = 'esotereciiGames';

const emptyGameForm = { name: '', date: '' };
const emptyPlayerForm = { name: '', character: '' };

function readStoredGames(): Game[] {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      return JSON.parse(current) as Game[];
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

  // Sync URL with state when selecting game or match
  useEffect(() => {
    const buildUrl = () => {
      if (!selectedGameId) return '/';
      if (!selectedMatchId) return `/game/${selectedGameId}`;
      return `/game/${selectedGameId}/match/${selectedMatchId}`;
    };
    const url = buildUrl();
    try {
      window.history.pushState({ selectedGameId, selectedMatchId }, '', url);
    } catch (e) {
      // ignore
    }
  }, [selectedGameId, selectedMatchId]);

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
          setFocusTarget('matchSummary');
        }
      } else {
        setSelectedGameId(null);
        setSelectedMatchId(null);
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

  const handleCreateGame = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = gameForm.name.trim();
    const date = gameForm.date;
    if (!name || !date) {
      return;
    }

    const newGame: Game = {
      id: `${Date.now()}`,
      name,
      date,
      players: [],
      matches: [],
    };

    setGames((current) => [...current, newGame]);
    setSelectedGameId(newGame.id);
    setSelectedMatchId(null);
    setGameForm(emptyGameForm);
    setFocusTarget('playerName');
  };

  const handleAddPlayer = (event: React.FormEvent<HTMLFormElement>) => {
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

    const playerIds = shuffle(selectedGame.players.map((player) => player.id));
    const matches: Match[] = [];

    for (let index = 0; index < playerIds.length; index += 2) {
      matches.push(createMatch(playerIds[index], playerIds[index + 1], playerIds));
    }

    updateGame({ ...selectedGame, matches });
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

    const updatedMatches = selectedGame.matches.map((match) => {
      if (match.id !== matchId || match.result) {
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

    updateGame({ ...selectedGame, matches: updatedMatches });
  };

  const computeMatchResult = (bets: Record<string, Bet>, winnerId: string) => {
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

    const updatedMatches = selectedGame.matches.map((match) => {
      if (match.id !== matchId || match.result) {
        return match;
      }

      const result = computeMatchResult(match.bets, winnerId);
      return { ...match, result };
    });

    updateGame({ ...selectedGame, matches: updatedMatches });
  };

  const leaderboard = useMemo(() => {
    if (!selectedGame) {
      return [];
    }

    const totals: Record<string, number> = {};
    selectedGame.players.forEach((player) => {
      totals[player.id] = 0;
    });

    selectedGame.matches.forEach((match) => {
      if (!match.result) {
        return;
      }
      Object.entries(match.result.net).forEach(([bettorId, value]) => {
        totals[bettorId] = (totals[bettorId] || 0) + value;
      });
    });

    return selectedGame.players
      .map((player) => ({
        player,
        net: Number((totals[player.id] || 0).toFixed(2)),
      }))
      .sort((a, b) => b.net - a.net);
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
          Date
          <input
            type="text"
            value={gameForm.date}
            onChange={(event) => setGameForm({ ...gameForm, date: event.target.value })}
            placeholder="YYYY-MM-DD"
            aria-label="Game date (YYYY-MM-DD)"
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
                  <span>{game.date}</span>
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

    const matchLabel = `${playerA.name} (${playerA.character}) vs ${playerB.name} (${playerB.character})`;
    const isCompleted = Boolean(match.result);

    return (
      <button
        key={match.id}
        type="button"
        className="match-card match-summary"
        onClick={() => {
          setSelectedMatchId(match.id);
          setFocusTarget('matchDetail');
        }}
        aria-label={`Open match details for ${playerA.name} vs ${playerB.name}`}
      >
        <div className="match-header">
          <div>
            <h3>{matchLabel}</h3>
            <p className={isCompleted ? 'tag completed' : 'tag upcoming'}>
              {isCompleted
                ? `Finished: ${selectedGame.players.find((player) => player.id === match.result?.winnerId)?.name ?? 'Winner'}`
                : 'Upcoming'}
            </p>
          </div>
        </div>
      </button>
    );
  };

  const renderMatchDetail = (match: Match) => {
    const playerA = selectedGame?.players.find((player) => player.id === match.playerAId);
    const playerB = selectedGame?.players.find((player) => player.id === match.playerBId);
    if (!selectedGame || !playerA || !playerB) {
      return null;
    }

    const isCompleted = Boolean(match.result);

    return (
      <section className="card match-detail-page" ref={matchDetailRef}>
        <div className="match-header">
          <div>
            <h2>{`${playerA.name} vs ${playerB.name}`}</h2>
            <p className={isCompleted ? 'tag completed' : 'tag upcoming'}>
              {isCompleted ? 'Finished' : 'Upcoming'}
            </p>
          </div>
          <div className="match-actions">
            {!isCompleted && (
              <>
                <button type="button" className="btn" onClick={() => handleSetWinner(match.id, match.playerAId)}>
                  Mark {playerA.name} Winner
                </button>
                <button type="button" className="btn" onClick={() => handleSetWinner(match.id, match.playerBId)}>
                  Mark {playerB.name} Winner
                </button>
              </>
            )}
          </div>
        </div>

        <div className="section">
          <h3>{isCompleted ? 'Results' : 'Bets'}</h3>
          {isCompleted && match.result && (
            <div className="summary-card">
              <div><strong>Total pot:</strong> ${match.result.totalBet.toFixed(2)}</div>
              <div><strong>Winner:</strong> {selectedGame.players.find((player) => player.id === match.result?.winnerId)?.name ?? 'Winner'}</div>
            </div>
          )}
          <div className="bets-list">
            {selectedGame.players.map((bettor) => {
              const bet = match.bets[bettor.id] || { targetId: match.playerAId, amount: 0 };
              const inMatch = bettor.id === match.playerAId || bettor.id === match.playerBId;
              const target = selectedGame.players.find((player) => player.id === bet.targetId);
              const payout = match.result?.payout[bettor.id] ?? 0;
              const net = match.result?.net[bettor.id] ?? 0;

              return (
                <div className={`bet-card ${inMatch ? 'in-match' : ''}`} key={bettor.id}>
                  <div className="bettor-name">{inMatch ? '⚔️' : ''} {bettor.name}</div>
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
                          value={bet.amount}
                          aria-label={`Amount for ${bettor.name}`}
                          onChange={(event) => handleBetUpdate(match.id, bettor.id, 'amount', event.target.value)}
                        />
                      </label>
                      <label className="bet-field">
                        <span className="field-label">Bet On</span>
                        <select
                          value={bet.targetId}
                          aria-label={`Bet target for ${bettor.name}`}
                          onChange={(event) => handleBetUpdate(match.id, bettor.id, 'targetId', event.target.value)}
                        >
                          <option value={playerA.id}>{playerA.name}</option>
                          <option value={playerB.id}>{playerB.name}</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSelectedMatchId(null);
              setFocusTarget('matchSummary');
            }}
          >
            ← Back to game
          </button>
        </div>
      </section>
    );
  };

  const renderSelectedGame = () => {
    if (!selectedGame) {
      return null;
    }

    // Page 2: when a game is selected and no match is selected
    const activeMatch = selectedMatchId ? selectedGame.matches.find((m) => m.id === selectedMatchId) ?? null : null;
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
          }}
        >
          ← Back to games
        </button>

        <section className="card selected-game-card">
          <div className="game-header">
            <div>
              <h2>{selectedGame.name}</h2>
              <p>{selectedGame.date}</p>
            </div>
          </div>

          {!hasMatches ? (
            // Setup view: add players and then randomize
            <div className="section">
              <h3>Add players</h3>
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
                <p className="muted">Tap a match to open its full view</p>
                <div className="matches-list" ref={matchesListRef}>
                  {selectedGame.matches.map((match) => renderMatch(match))}
                </div>
              </div>

              <div className="section">
                <h3>Leaderboard</h3>
                {leaderboard.length > 0 ? (
                  <ul className="entity-list">
                    {leaderboard.map(({ player, net }) => (
                      <li className="entity-card" key={player.id}>
                        <div>{player.name} as <strong>{player.character}</strong></div>
                        <div className={`leader-net ${net >= 0 ? 'positive' : 'negative'}`}>${net.toFixed(2)}</div>
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
