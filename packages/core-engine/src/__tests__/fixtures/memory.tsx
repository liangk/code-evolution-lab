import React, { useEffect } from 'react';

function Widget() {
  useEffect(() => {
    window.addEventListener('resize', onResize);
    setInterval(poll, 1000);
  }, []);
  return null;
}
