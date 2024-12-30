let explosionTimer = null;

self.onmessage = function(e) {
    const { id, duration } = e.data;
    
    // Clear any existing timer
    if (explosionTimer) {
        clearInterval(explosionTimer);
    }
    
    let startTime = Date.now();
    
    // Send updates about the explosion state
    explosionTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= duration) {
            self.postMessage({ id, type: 'complete' });
            clearInterval(explosionTimer);
        } else {
            self.postMessage({ 
                id, 
                type: 'update',
                progress: elapsed / duration
            });
        }
    }, 1000 / 60);  // 60fps updates
}; 