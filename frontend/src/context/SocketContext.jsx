import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = '/';

const SocketContext = createContext(null);

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const listeners = useRef({});

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  const connect = (gameId, playerId, role) => {
    if (socket) {
      socket.disconnect();
    }

    const newSocket = io(SOCKET_URL);

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setIsConnected(true);
      newSocket.emit('player:join', { gameId, playerId, role });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setIsConnected(false);
    });

    const events = [
      'round:status-change',
      'buzz:queue-update',
      'answer:result',
      'game:scores-update',
      'player:connected',
      'players:update'
    ];

    events.forEach(event => {
      newSocket.on(event, (data) => {
        if (listeners.current[event]) {
          listeners.current[event].forEach(cb => cb(data));
        }
      });
    });

    setSocket(newSocket);
  };

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  };

  const on = (event, callback) => {
    if (!listeners.current[event]) {
      listeners.current[event] = [];
    }
    listeners.current[event].push(callback);
  };

  const off = (event, callback) => {
    if (listeners.current[event]) {
      listeners.current[event] = listeners.current[event].filter(cb => cb !== callback);
    }
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, connect, disconnect, on, off }}>
      {children}
    </SocketContext.Provider>
  );
};
