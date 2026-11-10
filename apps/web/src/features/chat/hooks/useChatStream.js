import { useReducer, useRef, useCallback } from 'react';
import { chatReducer, initialChatState } from '../state/chatReducer.js';
import { streamChatQuery } from '../api/chatApi.js';

export function useChatStream({ sessionId, onFinish }) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortControllerRef = useRef(null);

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || state.isStreaming) return;

    dispatch({
      type: 'USER_MESSAGE_SENT',
      payload: { content }
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await streamChatQuery({
        sessionId,
        message: content,
        signal: abortController.signal,
        onEvent: (event) => {
          dispatch(event);
        }
      });
      if (onFinish) onFinish();
    } catch (err) {
      if (abortController.signal.aborted) {
        dispatch({ type: 'STREAM_ABORTED' });
      } else {
        dispatch({
          type: 'error',
          payload: { message: err.message }
        });
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [sessionId, state.isStreaming, onFinish]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      dispatch({ type: 'STREAM_ABORTED' });
    }
  }, []);

  const loadMessages = useCallback((messages) => {
    dispatch({
      type: 'LOAD_SESSION_MESSAGES',
      payload: { messages }
    });
  }, []);

  const highlightSource = useCallback((index) => {
    dispatch({
      type: 'HIGHLIGHT_SOURCE',
      payload: { index }
    });
  }, []);

  return {
    state,
    sendMessage,
    stopGeneration,
    loadMessages,
    highlightSource
  };
}

