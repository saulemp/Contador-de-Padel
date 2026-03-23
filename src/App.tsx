/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, RotateCcw, Info, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ScoreValue = 0 | 15 | 30 | 40;
const PADEL_POINTS: ScoreValue[] = [0, 15, 30, 40];

interface TeamState {
  pointsIdx: number;
  games: number;
  sets: number;
}

let speakTimeout: any = null;

const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export default function App() {
  const [match, setMatch] = useState({
    teamA: { pointsIdx: 0, games: 0, sets: 0 },
    teamB: { pointsIdx: 0, games: 0, sets: 0 },
    server: 'A' as 'A' | 'B'
  });
  const [showInstructions, setShowInstructions] = useState(false);
  const [debugKey, setDebugKey] = useState<string | null>(null);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const gamepadRaf = useRef<number | null>(null);
  const speakTimeoutRef = useRef<any>(null);
  
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    if (speakTimeoutRef.current) {
      clearTimeout(speakTimeoutRef.current);
    }
    
    speakTimeoutRef.current = setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      
      // Ensure we don't speak empty text
      if (text.trim()) {
        window.speechSynthesis.speak(utterance);
      }
      speakTimeoutRef.current = null;
    }, 150);
  }, []);

  const vibrate = useCallback((pattern: number | number[] = 50) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  const { teamA, teamB, server } = match;
  
  // Refs for long press and gestures
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingPointTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingClicksA = useRef(0);
  const pendingClicksB = useRef(0);
  const isLongPress = useRef(false);
  const LONG_PRESS_DURATION = 500;
  const POINT_DELAY = 1000; // Reduced to 1 second as requested
  const GESTURE_DELAY = 400; // Delay to wait for next key in sequence

  // Sequence detection for gestures
  const lastKey = useRef<{ key: string, time: number } | null>(null);
  const keySequence = useRef<string[]>([]);
  const sequenceTimer = useRef<NodeJS.Timeout | null>(null);
  const isTouchDevice = useRef(false);

  const announceScore = useCallback((winner: 'A' | 'B' | null, stateA: TeamState, stateB: TeamState, currentServer: 'A' | 'B') => {
    const winnerName = winner === 'A' ? 'Nosotros' : 'Punto para ellos'; // "para ellos" is clearer
    const scoreA = PADEL_POINTS[stateA.pointsIdx];
    const scoreB = PADEL_POINTS[stateB.pointsIdx];
    
    let text = '';
    if (winner) {
      text += `${winnerName}. `;
    }

    if (currentServer === 'A') {
      text += `${scoreA} a ${scoreB}`;
    } else {
      text += `${scoreB} a ${scoreA}`;
    }
    
    speak(text);
  }, [speak]);

  const addPoints = useCallback((team: 'A' | 'B', count: number) => {
    setMatch(prev => {
      let nextA = { ...prev.teamA };
      let nextB = { ...prev.teamB };
      let currentServer = prev.server;
      let gameWon = false;

      for (let i = 0; i < count; i++) {
        gameWon = false;
        if (team === 'A') {
          if (nextA.pointsIdx === 3) {
            nextB.pointsIdx = 0;
            nextA.pointsIdx = 0;
            nextA.games += 1;
            gameWon = true;
            if (nextA.games >= 6 && nextA.games >= nextB.games + 2) {
              nextA.games = 0;
              nextB.games = 0;
              nextA.sets += 1;
            }
          } else {
            nextA.pointsIdx += 1;
          }
        } else {
          if (nextB.pointsIdx === 3) {
            nextA.pointsIdx = 0;
            nextB.pointsIdx = 0;
            nextB.games += 1;
            gameWon = true;
            if (nextB.games >= 6 && nextB.games >= nextA.games + 2) {
              nextA.games = 0;
              nextB.games = 0;
              nextB.sets += 1;
            }
          } else {
            nextB.pointsIdx += 1;
          }
        }

        if (gameWon) {
          currentServer = currentServer === 'A' ? 'B' : 'A';
          const winnerName = team === 'A' ? 'Nosotros' : 'Punto para ellos';
          const serviceText = currentServer === 'A' ? 'Sacamos nosotros' : 'Sacan ellos';
          const gameScoreText = `Nosotros ${nextA.games}, ellos ${nextB.games} games.`;
          speak(`${winnerName} ganan el juego. ${gameScoreText} ${serviceText}.`);
        }
      }

      if (!gameWon) {
        announceScore(team, nextA, nextB, currentServer);
      }

      vibrate(team === 'A' ? 50 : [50, 30, 50]);
      return { teamA: nextA, teamB: nextB, server: currentServer };
    });
  }, [announceScore, speak, vibrate]);

  const updateGames = (team: 'A' | 'B', delta: number) => {
    setMatch(prev => ({
      ...prev,
      [team === 'A' ? 'teamA' : 'teamB']: {
        ...prev[team === 'A' ? 'teamA' : 'teamB'],
        games: Math.max(0, prev[team === 'A' ? 'teamA' : 'teamB'].games + delta)
      }
    }));
  };

  const updateSets = (team: 'A' | 'B', delta: number) => {
    setMatch(prev => ({
      ...prev,
      [team === 'A' ? 'teamA' : 'teamB']: {
        ...prev[team === 'A' ? 'teamA' : 'teamB'],
        sets: Math.max(0, prev[team === 'A' ? 'teamA' : 'teamB'].sets + delta)
      }
    }));
  };

  const subtractPoint = useCallback((team: 'A' | 'B') => {
    setMatch(prev => {
      let nextA = { ...prev.teamA };
      let nextB = { ...prev.teamB };

      if (team === 'A') {
        if (nextA.pointsIdx > 0) {
          nextA.pointsIdx -= 1;
        } else if (nextA.games > 0) {
          nextA.games -= 1;
          nextA.pointsIdx = 3;
        }
      } else {
        if (nextB.pointsIdx > 0) {
          nextB.pointsIdx -= 1;
        } else if (nextB.games > 0) {
          nextB.games -= 1;
          nextB.pointsIdx = 3;
        }
      }

      vibrate(100);
      announceScore(null, nextA, nextB, prev.server);
      return { ...prev, teamA: nextA, teamB: nextB };
    });
  }, [announceScore, vibrate]);

  const changeServer = useCallback((team?: 'A' | 'B') => {
    setMatch(prev => {
      const next = team || (prev.server === 'A' ? 'B' : 'A');
      if (team && next === prev.server) return prev;
      vibrate([30, 30, 30]);
      speak(next === 'A' ? 'Sacamos nosotros' : 'Sacan ellos');
      return { ...prev, server: next };
    });
  }, [speak, vibrate]);

  const resetMatch = () => {
    setMatch({
      teamA: { pointsIdx: 0, games: 0, sets: 0 },
      teamB: { pointsIdx: 0, games: 0, sets: 0 },
      server: 'A'
    });
    speak('Partido reiniciado');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Common volume and media keys across devices, including common Bluetooth remote keys
      const isVolUp = 
        e.key === 'VolumeUp' || 
        e.key === 'AudioVolumeUp' || 
        e.code === 'VolumeUp' || 
        e.keyCode === 175 || 
        e.keyCode === 24 || // Android VolumeUp
        e.key === 'ArrowUp' ||
        e.key === 'PageUp' ||
        e.key === 'Enter' ||
        e.key === ' ' ||
        e.key === 'MediaTrackNext' ||
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaStop' ||
        e.key === 'MediaFastForward' ||
        (e.key === 'Unidentified' && e.keyCode === 0); // Some remotes send this
        
      const isVolDown = 
        e.key === 'VolumeDown' || 
        e.key === 'AudioVolumeDown' || 
        e.code === 'VolumeDown' || 
        e.keyCode === 174 ||
        e.keyCode === 25 || // Android VolumeDown
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === 'MediaTrackPrevious' ||
        e.key === 'MediaPause' ||
        e.key === 'MediaRewind';

      if (isVolUp || isVolDown) {
        // Only prevent default if it's not a standard interaction key that might be needed
        if (e.key !== ' ' && e.key !== 'Enter') {
          e.preventDefault();
        }
        
        // Cancel any pending point addition because a new key was pressed
        if (pendingPointTimer.current) {
          clearTimeout(pendingPointTimer.current);
          pendingPointTimer.current = null;
        }

        const now = Date.now();
        const key = isVolUp ? 'U' : 'D';
        setDebugKey(e.key || e.code || `Key:${e.keyCode}`);
        setTimeout(() => setDebugKey(null), 500);

        // Sequence detection for reset (UUDD)
        keySequence.current.push(key);
        if (keySequence.current.length > 4) keySequence.current.shift();
        if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
        sequenceTimer.current = setTimeout(() => { keySequence.current = []; }, 1000);

        if (keySequence.current.join('') === 'UUDD') {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
          isLongPress.current = true;
          resetMatch();
          keySequence.current = [];
          lastKey.current = null;
          return;
        }

        // Sequence detection for Vol+ then Vol- (Server Toggle)
        if (isVolDown && lastKey.current?.key === 'VolUp' && now - lastKey.current.time < 800) {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
          isLongPress.current = true; // Block the point addition
          changeServer();
          lastKey.current = null;
          keySequence.current = [];
          return;
        }
        
        if (isVolUp) lastKey.current = { key: 'VolUp', time: now };

        if (!longPressTimer.current) {
          isLongPress.current = false;
          longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            subtractPoint(isVolUp ? 'A' : 'B');
          }, LONG_PRESS_DURATION);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isVolUp = 
        e.key === 'VolumeUp' || 
        e.key === 'AudioVolumeUp' || 
        e.code === 'VolumeUp' || 
        e.keyCode === 175 || 
        e.keyCode === 24 || // Android VolumeUp
        e.key === 'ArrowUp' ||
        e.key === 'PageUp' ||
        e.key === 'Enter' ||
        e.key === ' ' ||
        e.key === 'MediaTrackNext' ||
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaStop' ||
        e.key === 'MediaFastForward' ||
        (e.key === 'Unidentified' && e.keyCode === 0);
        
      const isVolDown = 
        e.key === 'VolumeDown' || 
        e.key === 'AudioVolumeDown' || 
        e.code === 'VolumeDown' || 
        e.keyCode === 174 ||
        e.keyCode === 25 || // Android VolumeDown
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === 'MediaTrackPrevious' ||
        e.key === 'MediaPause' ||
        e.key === 'MediaRewind';

      if (isVolUp || isVolDown) {
        if (e.key !== ' ' && e.key !== 'Enter') {
          e.preventDefault();
        }
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
          
          if (!isLongPress.current) {
            // Delay point addition to see if it's part of a gesture or multiple clicks
            const team = isVolUp ? 'A' : 'B';
            if (team === 'A') pendingClicksA.current++;
            else pendingClicksB.current++;

            if (pendingPointTimer.current) clearTimeout(pendingPointTimer.current);
            
            pendingPointTimer.current = setTimeout(() => {
              const countA = pendingClicksA.current;
              const countB = pendingClicksB.current;
              
              if (countA > 0) addPoints('A', countA);
              if (countB > 0) addPoints('B', countB);
              
              pendingClicksA.current = 0;
              pendingClicksB.current = 0;
              pendingPointTimer.current = null;
            }, POINT_DELAY);
          }
        }
      }
    };

    // Gamepad API support for some remotes
    const checkGamepads = () => {
      const gamepads = navigator.getGamepads();
      let connected = false;
      for (const gp of gamepads) {
        if (!gp) continue;
        connected = true;
        // Check buttons (usually 0 or 1 for simple remotes)
        gp.buttons.forEach((btn, idx) => {
          if (btn.pressed || btn.value > 0.5) {
            const now = Date.now();
            // Debounce gamepad buttons
            if (lastKey.current && lastKey.current.key === `GP_${idx}` && now - lastKey.current.time < 250) return;
            lastKey.current = { key: `GP_${idx}`, time: now };
            
            setDebugKey(`GP Button ${idx}`);
            setTimeout(() => setDebugKey(null), 500);
            
            // AB Shutter 3 and similar remotes often use 0, 1, 2, 3
            // Mapping: 0/2/11/12 for Team A, 1/3/13/14 for Team B
            if (idx === 0 || idx === 2 || idx === 11 || idx === 12 || idx === 4) { 
              addPoints('A', 1);
            } else if (idx === 1 || idx === 3 || idx === 13 || idx === 14 || idx === 5) {
              addPoints('B', 1);
            }
          }
        });
      }
      setGamepadConnected(connected);
      gamepadRaf.current = requestAnimationFrame(checkGamepads);
    };

    if ('getGamepads' in navigator) {
      gamepadRaf.current = requestAnimationFrame(checkGamepads);
    }

    // Use capture: true to intercept events before other handlers
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });

    const handleRemoteA = () => {
      // Use a small debounce to prevent double triggers from remotes that send multiple events
      const now = Date.now();
      if (lastKey.current && lastKey.current.key === 'REMOTE_A' && now - lastKey.current.time < 300) return;
      lastKey.current = { key: 'REMOTE_A', time: now };

      setDebugKey('Remoto: Nosotros');
      setTimeout(() => setDebugKey(null), 500);

      if (pendingPointTimer.current) clearTimeout(pendingPointTimer.current);
      pendingClicksA.current++;
      pendingPointTimer.current = setTimeout(() => {
        addPoints('A', pendingClicksA.current);
        pendingClicksA.current = 0;
        pendingPointTimer.current = null;
      }, POINT_DELAY);
    };

    const handleRemoteB = () => {
      const now = Date.now();
      if (lastKey.current && lastKey.current.key === 'REMOTE_B' && now - lastKey.current.time < 300) return;
      lastKey.current = { key: 'REMOTE_B', time: now };

      setDebugKey('Remoto: Ellos');
      setTimeout(() => setDebugKey(null), 500);

      if (pendingPointTimer.current) clearTimeout(pendingPointTimer.current);
      pendingClicksB.current++;
      pendingPointTimer.current = setTimeout(() => {
        addPoints('B', pendingClicksB.current);
        pendingClicksB.current = 0;
        pendingPointTimer.current = null;
      }, POINT_DELAY);
    };

    // Try to play dummy audio on first interaction to enable MediaSession and Gamepad
    const enableAudio = () => {
      // Wake up Gamepad API
      if ('getGamepads' in navigator) {
        navigator.getGamepads();
      }
      
      const audio = document.getElementById('dummy-audio') as HTMLAudioElement;
      if (audio) {
        audio.volume = 0.001; // Extremely low volume
        audio.play().then(() => {
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
            
            // Re-register handlers on play to ensure they are active
            navigator.mediaSession.setActionHandler('play', handleRemoteA);
            navigator.mediaSession.setActionHandler('pause', handleRemoteB);
            navigator.mediaSession.setActionHandler('nexttrack', handleRemoteA);
            navigator.mediaSession.setActionHandler('previoustrack', handleRemoteB);
            navigator.mediaSession.setActionHandler('seekbackward', handleRemoteB);
            navigator.mediaSession.setActionHandler('seekforward', handleRemoteA);
          }
        }).catch(() => {});
      }
    };
    window.addEventListener('click', enableAudio, { once: true });
    window.addEventListener('touchstart', enableAudio, { once: true });

    // Media Session API for better Bluetooth remote support
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Padel Master - Marcador Activo',
        artist: 'Usa los botones de volumen o remoto',
        album: 'Padel Master',
        artwork: [
          { src: 'https://picsum.photos/seed/padel/512/512', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', handleRemoteA);
      navigator.mediaSession.setActionHandler('pause', handleRemoteB);
      navigator.mediaSession.setActionHandler('nexttrack', handleRemoteA);
      navigator.mediaSession.setActionHandler('previoustrack', handleRemoteB);
      navigator.mediaSession.setActionHandler('seekbackward', handleRemoteB);
      navigator.mediaSession.setActionHandler('seekforward', handleRemoteA);
    }

    return () => {
      window.removeEventListener('click', enableAudio);
      window.removeEventListener('touchstart', enableAudio);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
      if (gamepadRaf.current) cancelAnimationFrame(gamepadRaf.current);
      if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current);
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (pendingPointTimer.current) clearTimeout(pendingPointTimer.current);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      }
    };
  }, [addPoints, subtractPoint, changeServer, speak, vibrate]);

  // Screen long press logic
  const handleScreenTouchStart = (e: React.MouseEvent | React.TouchEvent, team: 'A' | 'B') => {
    if (e.type === 'touchstart') {
      isTouchDevice.current = true;
    } else if (isTouchDevice.current) {
      return; // Ignore mouse events on touch devices
    }

    if ('button' in e && e.button !== 0) return;

    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      subtractPoint(team);
    }, LONG_PRESS_DURATION);
  };

  const handleScreenTouchEnd = (e: React.MouseEvent | React.TouchEvent, team: 'A' | 'B') => {
    if (e.type === 'touchend') {
      isTouchDevice.current = true;
    } else if (isTouchDevice.current) {
      return;
    }

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      if (!isLongPress.current) {
        if (team === 'A') pendingClicksA.current++;
        else pendingClicksB.current++;

        if (pendingPointTimer.current) clearTimeout(pendingPointTimer.current);
        
        pendingPointTimer.current = setTimeout(() => {
          const countA = pendingClicksA.current;
          const countB = pendingClicksB.current;
          
          if (countA > 0) addPoints('A', countA);
          if (countB > 0) addPoints('B', countB);
          
          pendingClicksA.current = 0;
          pendingClicksB.current = 0;
          pendingPointTimer.current = null;
        }, POINT_DELAY);
      }
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white font-sans selection:bg-yellow-400 selection:text-black flex flex-col p-2 md:p-4 overflow-hidden">
      {/* Debug Key Indicator */}
      <AnimatePresence>
        {gamepadConnected && (
        <div className="fixed top-4 right-4 bg-green-500/80 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse z-50">
          🎮 Remoto Conectado
        </div>
      )}
      
      {debugKey && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white/20 backdrop-blur-md px-4 py-2 rounded-full text-xs font-mono z-50 pointer-events-none"
          >
            Key: {debugKey}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-yellow-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Header - Compact for Landscape */}
      <header className="w-full flex justify-between items-center mb-2 z-10 px-4">
        {/* Dummy audio for MediaSession API support */}
        <audio id="dummy-audio" loop className="hidden">
          <source src={SILENT_WAV} type="audio/wav" />
        </audio>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
            <Trophy className="text-black w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tighter uppercase italic hidden sm:block">Padel Master</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const audio = document.getElementById('dummy-audio') as HTMLAudioElement;
              if (audio) {
                audio.play().then(() => speak('Control sincronizado')).catch(() => speak('Error al sincronizar'));
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-full transition-all text-[10px] font-bold uppercase tracking-widest"
          >
            Sincronizar
          </button>
          
          <button 
            onClick={resetMatch}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-full transition-all text-[10px] font-bold uppercase tracking-widest"
          >
            <RotateCcw className="w-3 h-3" />
            Reiniciar
          </button>
          
          <button 
            onClick={() => speak('Probando voz, nosotros 15, punto de ellos 30')}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Probar Voz"
          >
            <Settings2 className="w-5 h-5 text-blue-400" />
          </button>
          
          <button 
            onClick={() => setShowInstructions(!showInstructions)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Score Board - Grid 2 columns for landscape */}
      <main className="w-full grid grid-cols-2 gap-2 md:gap-4 z-10 flex-1">
        {/* Team A */}
        <TeamCard 
          name="Equipo A" 
          points={PADEL_POINTS[teamA.pointsIdx]} 
          games={teamA.games} 
          sets={teamA.sets}
          isServing={server === 'A'}
          color="border-yellow-400"
          accent="bg-yellow-400"
          onPointClick={() => {}} // Handled by touch events
          onGameClick={(d) => updateGames('A', d)}
          onSetClick={(d) => updateSets('A', d)}
          onServerToggle={() => changeServer('A')}
          onTouchStart={(e) => handleScreenTouchStart(e, 'A')}
          onTouchEnd={(e) => handleScreenTouchEnd(e, 'A')}
        />

        {/* Team B */}
        <TeamCard 
          name="Equipo B" 
          points={PADEL_POINTS[teamB.pointsIdx]} 
          games={teamB.games} 
          sets={teamB.sets}
          isServing={server === 'B'}
          color="border-blue-500"
          accent="bg-blue-500"
          onPointClick={() => {}} // Handled by touch events
          onGameClick={(d) => updateGames('B', d)}
          onSetClick={(d) => updateSets('B', d)}
          onServerToggle={() => changeServer('B')}
          onTouchStart={(e) => handleScreenTouchStart(e, 'B')}
          onTouchEnd={(e) => handleScreenTouchEnd(e, 'B')}
        />
      </main>

      {/* Instructions Overlay */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowInstructions(false)}
          >
            <motion.div 
              className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings2 className="w-6 h-6 text-yellow-400" />
                  Control Remoto
                </h2>
                <button onClick={() => setShowInstructions(false)} className="text-white/50 hover:text-white">✕</button>
              </div>
              <ul className="space-y-4 text-white/80">
                <li className="flex items-center gap-4">
                  <span className="px-3 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center font-bold text-xs border border-blue-500/30">SINCRONIZAR</span>
                  <span className="text-sm"><strong>IMPORTANTE:</strong> Presiona este botón para activar el control remoto. <strong>Ya no necesitas apps externas como Button Mapper.</strong></span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center font-bold text-sm">🎮</span>
                  <span className="text-sm"><strong>AB Shutter 3:</strong> Si ves el icono 🎮 arriba, el botón grande suma a "Nosotros" y el pequeño a "Ellos".</span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold text-sm">VOL+</span>
                  <span className="text-sm">Suma punto al <strong>Equipo A</strong></span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold text-sm">VOL-</span>
                  <span className="text-sm">Suma punto al <strong>Equipo B</strong></span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="px-3 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold text-xs">VOL+ LUEGO VOL-</span>
                  <span className="text-sm">Cambia quién saca</span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="px-3 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold text-xs">VOL+ VOL+ VOL- VOL-</span>
                  <span className="text-sm">Reiniciar partido</span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="px-3 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold text-xs">MANTENER</span>
                  <span className="text-sm">Resta 1 punto (deshacer)</span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
                    <Settings2 className="w-5 h-5" />
                  </span>
                  <span className="text-sm">La app vibrará al marcar puntos para confirmar tu acción.</span>
                </li>
                <li className="mt-4 pt-4 border-t border-white/10">
                  <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2">¿No funciona en Chrome?</h3>
                  <p className="text-[11px] leading-relaxed opacity-70">
                    1. Usa <strong>"Instalar aplicación"</strong> o "Añadir a pantalla de inicio" en el menú de Chrome.<br/>
                    2. Asegúrate de que el volumen multimedia no esté en cero.<br/>
                    3. Si usas control Bluetooth, presiona <strong>SINCRONIZAR</strong> después de conectarlo.
                  </p>
                </li>
              </ul>
              <button 
                onClick={() => setShowInstructions(false)}
                className="w-full mt-8 py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition-colors"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TeamCard({ 
  name, points, games, sets, isServing, color, accent, 
  onPointClick, onGameClick, onSetClick, onServerToggle,
  onTouchStart, onTouchEnd 
}: { 
  name: string, 
  points: number | string, 
  games: number, 
  sets: number,
  isServing: boolean,
  color: string,
  accent: string,
  onPointClick: () => void,
  onGameClick: (delta: number) => void,
  onSetClick: (delta: number) => void,
  onServerToggle: () => void,
  onTouchStart: (e: React.MouseEvent | React.TouchEvent) => void,
  onTouchEnd: (e: React.MouseEvent | React.TouchEvent) => void
}) {
  return (
    <motion.div 
      className={`relative h-full bg-white/5 border-2 ${color} rounded-[24px] md:rounded-[48px] p-2 md:p-6 flex flex-col items-center justify-between group overflow-hidden transition-all`}
    >
      {/* Decorative background number */}
      <div className="absolute -bottom-6 -right-6 text-[100px] md:text-[200px] font-black text-white/[0.02] select-none pointer-events-none">
        {games}
      </div>

      <div className="w-full flex justify-between items-start z-10">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${accent} ${isServing ? 'animate-ping' : 'opacity-20'}`} />
          <span className="text-[10px] md:text-xs font-bold tracking-widest uppercase opacity-50">{name}</span>
        </div>
        
        {/* Sets Display */}
        <div className="flex flex-col items-end">
          <span className="text-[8px] uppercase tracking-widest opacity-40">Sets</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onSetClick(-1)} className="text-xs opacity-30 hover:opacity-100 p-1">-</button>
            <span className="text-lg md:text-2xl font-bold text-yellow-400/80">{sets}</span>
            <button onClick={() => onSetClick(1)} className="text-xs opacity-30 hover:opacity-100 p-1">+</button>
          </div>
        </div>
      </div>

      <div 
        className="flex-1 flex flex-col items-center justify-center w-full relative" 
        onMouseDown={onTouchStart}
        onMouseUp={onTouchEnd}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Server Indicator Button */}
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            onServerToggle(); 
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className={`absolute top-0 right-0 w-10 h-10 rounded-full border border-white/10 flex items-center justify-center transition-all z-20 ${isServing ? 'bg-yellow-400 text-black scale-110 shadow-[0_0_15px_rgba(250,204,21,0.4)]' : 'bg-white/5 text-white/30'}`}
        >
          <div className={`w-3 h-3 rounded-full ${isServing ? 'bg-black' : 'bg-white/20'}`} />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={points}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="text-[100px] sm:text-[120px] md:text-[180px] font-black leading-none tracking-tighter cursor-pointer select-none"
          >
            {points}
          </motion.div>
        </AnimatePresence>
      </div>
      
      <div className="w-full flex items-center justify-center gap-3 md:gap-6 mb-2 z-10">
        <div className="h-[1px] flex-1 bg-white/10" />
        <div className="flex flex-col items-center">
          <span className="text-[8px] md:text-[10px] uppercase tracking-[0.3em] opacity-40">Games</span>
          <div className="flex items-center gap-4">
            <button onClick={() => onGameClick(-1)} className="text-lg opacity-30 hover:opacity-100">-</button>
            <span className="text-3xl md:text-5xl font-bold font-mono">{games}</span>
            <button onClick={() => onGameClick(1)} className="text-lg opacity-30 hover:opacity-100">+</button>
          </div>
        </div>
        <div className="h-[1px] flex-1 bg-white/10" />
      </div>
    </motion.div>
  );
}
