import { useEffect, useRef } from 'react';

export function useAutoScroll(dependencies = []) {
  const containerRef = useRef(null);
  const userScrolledUpRef = useRef(false);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    userScrolledUpRef.current = distanceToBottom > 100;
  };

  useEffect(() => {
    if (containerRef.current && !userScrolledUpRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, dependencies);

  return { containerRef, handleScroll };
}

