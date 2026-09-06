import React, { useEffect } from 'react';

function YandexAd({ blockId }) {
  useEffect(() => {
    if (window.yaContextCb) {
      window.yaContextCb.push(() => {
        if (window.Ya && window.Ya.Context && window.Ya.Context.AdvManager) {
          window.Ya.Context.AdvManager.render({
            blockId: blockId,
            renderTo: `yandex_rtb_${blockId}`
            // ❌ УБЕРИ test: true
          });
        }
      });
    }
  }, [blockId]);

  return (
    <div 
      id={`yandex_rtb_${blockId}`} 
      style={{ minHeight: '250px' }}
    />
  );
}

export default YandexAd;