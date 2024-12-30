// Main controls component (pause/reset/keymap)
const MainControls = () => {
    const [isPaused, setIsPaused] = React.useState(false);

    React.useEffect(() => {
        window.updatePauseState = setIsPaused;
        return () => {
            window.updatePauseState = null;
        };
    }, []);

    const handlePause = () => {
        const game = window.game;
        if (game) {
            game.isPaused = !game.isPaused;
            setIsPaused(game.isPaused);
        }
    };

    const handleReset = () => {
        const game = window.game;
        if (game) {
            game.restartGame();
        }
    };

    return (
        <div className="controls-group">
            <button 
                onClick={handlePause}
                className="control-button"
                title={isPaused ? "Resume Game" : "Pause Game"}
            >
                {isPaused ? (
                    <svg width="24" height="24" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                )}
            </button>
            <button 
                onClick={handleReset}
                className="control-button"
                title="Reset Game"
            >
                <svg width="24" height="24" viewBox="0 0 24 24">
                    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                </svg>
            </button>
            <KeyMapButton />
        </div>
    );
};

// Key mapping button component
const KeyMapButton = () => {
    const [showKeyMap, setShowKeyMap] = React.useState(false);
    const [listening, setListening] = React.useState(null);
    const [keyMap, setKeyMap] = React.useState({
        left: 'ArrowLeft',
        right: 'ArrowRight',
        shoot: ' ',
        pause: 'p'
    });

    React.useEffect(() => {
        const game = window.game;
        if (game) {
            Object.entries(keyMap).forEach(([action, key]) => {
                game.updateKeyMap(action, key);
            });
        }
    }, []);

    const handleKeyPress = (e) => {
        if (listening) {
            e.preventDefault();
            e.stopPropagation();
            
            const newKeyMap = { ...keyMap, [listening]: e.key };
            setKeyMap(newKeyMap);
            setListening(null);
            
            const game = window.game;
            if (game) {
                game.updateKeyMap(listening, e.key);
                game.keys = {};
            }
        }
    };

    React.useEffect(() => {
        if (listening) {
            window.addEventListener('keydown', handleKeyPress);
            return () => window.removeEventListener('keydown', handleKeyPress);
        }
    }, [listening]);

    return (
        <div style={{ position: 'relative' }}>
            <button 
                onClick={() => setShowKeyMap(!showKeyMap)}
                className="control-button"
                title="Key Mapping"
            >
                <svg width="24" height="24" viewBox="0 0 24 24">
                    <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
                </svg>
            </button>
            
            {showKeyMap && (
                <div className="key-map-popup">
                    <h3 className="key-map-title">Key Mapping</h3>
                    {Object.entries(keyMap).map(([action, key]) => (
                        <div key={action} className="key-map-row">
                            <span className="key-map-label">{action}:</span>
                            <button 
                                onClick={() => setListening(action)}
                                className="key-button"
                            >
                                {listening === action ? 'Press a key...' : key}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Export components to global scope
window.Controls = {
    MainControls
}; 