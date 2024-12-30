class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        // Initialize image loading state
        this.imagesLoaded = {
            bat: false,
            car: false,
            poop: false,
            wing: false,
            pine: false
        };
        
        // Load all game images
        this.loadImages();
        
        // Audio elements
        this.hitSound = new Audio('/static/hit.opus');
        this.hitSound.load();
        this.explosionSound = new Audio('/static/explosion.opus');
        this.explosionSound.load();
        
        // Explosion settings
        this.EXPLOSION_DURATION = 1000;  // 1 second for explosion animation
        
        // Default explosion animation settings (will be updated when GIF loads)
        this.explosionFrames = [];
        this.EXPLOSION_FRAME_DURATION = 50;  // Default, will be overwritten
        this.EXPLOSION_TOTAL_FRAMES = 1;     // Default, will be overwritten
        
        // Load and analyze explosion GIF
        this.loadExplosionGif();
        
        // Touch input detection
        this.hasTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        
        // Initialize viewport and world bounds
        this.viewportOffset = 0;
        this.worldBounds = {
            left: -this.canvas.width,
            right: this.canvas.width * 2
        };
        
        // Initialize game objects
        this.trees = [];
        this.stars = [];
        this.poops = [];
        this.cars = [];
        this.score = 0;
        this.carSpawnTimer = 0;
        
        // Initialize bat in world coordinates
        this.bat = {
            x: this.canvas.width / 2,
            y: 100,
            width: 25,
            height: 25,
            velocity: 0,
            maxSpeed: 5,
            acceleration: 0.4,
            deceleration: 0.2
        };
        
        // Wing configuration
        this.wingDistance = 0.8;  // This will be controlled by the slider
        
        // Key mapping
        this.keyMap = {
            shoot: ' ',
            pause: 'p',
            left: 'ArrowLeft',
            right: 'ArrowRight'
        };
        
        this.keys = {};
        this.setupEventListeners();
        
        // Add animation counters
        this.animationTime = 0;
        this.wingAngle = 0;
        this.bodyOffset = 0;
        
        // Game settings
        this.poopFadeDuration = 2000;
        this.gravity = 0.2;
        this.maxPoopAmmo = 5;
        this.poopAmmo = this.maxPoopAmmo;
        this.gameOver = false;
        this.baseCarSpeed = 3;
        this.speedMultiplier = 1;
        this.isPaused = false;

        // Content generation constants
        this.STAR_DENSITY = 0.0008;
        this.TREE_SPACING = 300;  // Maximum pixels between trees
        this.MIN_TREE_SPACING = 200;  // Minimum pixels between trees
        this.lastViewportPosition = 0;
        
        // Generate initial content
        this.generateInitialContent();

        // Car hit settings
        this.HIT_SPEED_MULTIPLIER = 2.5;  // Hit cars move 2.5x faster
        this.hitFlashTimer = 0;  // For 2Hz flashing
        this.FLASH_FREQUENCY = 2;  // Flash twice per second

        // Initialize bat facing left
        this.lastBatDirection = 1;  // 1 for left, -1 for right

        // Add explosions array
        this.explosions = [];
    }
    
    loadImages() {
        // Helper function to load an image with proper error handling
        const loadImage = (src, key) => {
            const img = new Image();
            img.src = src;
            
            img.onload = () => {
                this.imagesLoaded[key] = true;
                console.log(`${key} image loaded successfully`);
            };
            
            img.onerror = () => {
                this.imagesLoaded[key] = false;
                console.error(`Failed to load ${key} image`);
            };
            
            return img;
        };

        // Load all game images
        this.batImage = loadImage('/static/bat.png', 'bat');
        this.wingImage = loadImage('/static/wing.png', 'wing');
        this.carImage = loadImage('/static/car.png', 'car');
        this.poopImage = loadImage('/static/poop.png', 'poop');
        this.pineImage = loadImage('/static/pine.png', 'pine');
        
        // Initialize audio context after images are loaded
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('WebAudio API not supported:', e);
        }
    }
    
    setupEventListeners() {
        // Initialize audio on any user interaction
        const initAudioOnInteraction = () => {
            if (this.audioContext) {
                this.audioContext.resume().then(() => {
                    console.log('Audio context resumed');
                });
                window.removeEventListener('click', initAudioOnInteraction);
                window.removeEventListener('keydown', initAudioOnInteraction);
                window.removeEventListener('touchstart', initAudioOnInteraction);
            }
        };

        window.addEventListener('click', initAudioOnInteraction);
        window.addEventListener('keydown', initAudioOnInteraction);
        window.addEventListener('touchstart', initAudioOnInteraction, { passive: true });
        
        // Key event listeners
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === this.keyMap.pause) {
                this.isPaused = !this.isPaused;
                // Update React state if controls are mounted
                if (window.updatePauseState) {
                    window.updatePauseState(this.isPaused);
                }
            }
        });
        
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
        window.addEventListener('keypress', (e) => {
            if (e.key === this.keyMap.shoot) {
                if (this.gameOver) {
                    this.restartGame();
                } else {
                    this.shoot();
                }
            }
        });

        // Touch controls for bat interaction
        let touchStartX = null;
        let lastTouchX = null;
        let lastMovementDirection = 0;  // -1 for left, 1 for right, 0 for none
        
        this.canvas.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
            const y = (touch.clientY - rect.top) * (this.canvas.height / rect.height);
            
            // Check if touch is on the bat
            if (this.isTouchOnBat(x + this.viewportOffset, y)) {
                touchStartX = x;
                lastTouchX = x;
                lastMovementDirection = 0;
                e.preventDefault();  // Prevent scrolling
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (touchStartX !== null) {
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                const x = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
                
                // Calculate movement
                const movement = x - lastTouchX;
                const currentDirection = Math.sign(movement);
                
                // Only update direction if there's significant movement
                if (Math.abs(movement) > 1) {
                    // If direction changed, update it
                    if (currentDirection !== 0 && currentDirection !== lastMovementDirection) {
                        lastMovementDirection = currentDirection;
                    }
                }
                
                // Set velocity based on last movement direction
                this.bat.velocity = lastMovementDirection * this.bat.maxSpeed;
                
                lastTouchX = x;
                e.preventDefault();  // Prevent scrolling
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (touchStartX !== null) {
                // If it was a quick tap without much movement, shoot
                if (Math.abs(lastTouchX - touchStartX) < 10 && lastMovementDirection === 0) {
                    this.shoot();
                }
                touchStartX = null;
                lastTouchX = null;
                lastMovementDirection = 0;
                this.bat.velocity = 0;  // Stop bat movement
                e.preventDefault();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', () => {
            touchStartX = null;
            lastTouchX = null;
            lastMovementDirection = 0;
            this.bat.velocity = 0;  // Stop bat movement
        });

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.isPaused = true;
                if (window.updatePauseState) {
                    window.updatePauseState(true);
                }
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        // Initial canvas sizing
        this.resizeCanvas();
    }
    
    playPoopSound() {
        try {
            // Make sure audio context is running
            if (this.audioContext.state !== 'running') {
                this.audioContext.resume();
            }

            // Create oscillator and gain nodes
            const osc = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            // Connect nodes
            osc.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Make the sound more "splatty"
            osc.type = 'triangle'; // Change waveform type
            
            // Set initial frequency and gain
            const now = this.audioContext.currentTime;
            osc.frequency.setValueAtTime(400, now);
            gainNode.gain.setValueAtTime(0.5, now);
            
            // Create the "splat" effect
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            
            // Start and stop the sound
            osc.start(now);
            osc.stop(now + 0.2);

            console.log('Playing poop sound');
        } catch (e) {
            console.error('Error playing sound:', e);
        }
    }
    
    shoot() {
        if (this.gameOver) return;
        
        if (this.poopAmmo <= 0) return;
        
        if (this.audioContext) {
            this.playPoopSound();
        }
        
        const currentBatVelocity = this.bat.velocity;
        this.poopAmmo--;
        
        this.poops.push({
            x: this.bat.x + this.bat.width/2,
            y: this.bat.y + this.bat.height * 1.2,
            width: 20,
            height: 20,
            velocityX: currentBatVelocity,
            velocityY: 2,
            attached: false,
            attachedTo: null,
            grounded: false,
            groundedTime: null,
            opacity: 1
        });
    }
    
    getRandomCarColor() {
        const colors = [
            { base: '#FF0000', dark: '#8B0000' },     // Red
            { base: '#4169E1', dark: '#00008B' },     // Royal Blue
            { base: '#32CD32', dark: '#006400' },     // Lime Green
            { base: '#FFD700', dark: '#B8860B' },     // Gold
            { base: '#9370DB', dark: '#4B0082' },     // Purple
            { base: '#FF8C00', dark: '#8B4513' },     // Dark Orange
            { base: '#48D1CC', dark: '#008B8B' },     // Turquoise
            { base: '#FF69B4', dark: '#C71585' }      // Hot Pink
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    spawnCar() {
        const direction = Math.random() < 0.5 ? -1 : 1;
        // Spawn cars outside viewport
        const x = direction === -1 ? 
            this.viewportOffset + this.canvas.width + 100 : // Right of viewport
            this.viewportOffset - 100; // Left of viewport
        const laneOffset = direction === -1 ? -15 : 15;
        const carColor = this.getRandomCarColor();
        
        // Calculate speed multiplier based on score
        this.speedMultiplier = 1 + (this.score / 500) * 0.5;
        
        this.cars.push({
            x: x,
            y: this.canvas.height - 80 + laneOffset,
            width: 60,  // Reduced from 100 to 60 (40% less)
            height: 50,
            speed: this.baseCarSpeed * this.speedMultiplier * direction,
            isHit: false,
            color: carColor
        });
    }
    
    update() {
        if (this.gameOver) return;

        // Update bat position based on input
        const targetVelocity = (this.keys[this.keyMap.left] ? -this.bat.maxSpeed : 
                               this.keys[this.keyMap.right] ? this.bat.maxSpeed : 
                               0);
        
        if (this.bat.velocity < targetVelocity) {
            this.bat.velocity = Math.min(this.bat.velocity + this.bat.acceleration, targetVelocity);
        } else if (this.bat.velocity > targetVelocity) {
            this.bat.velocity = Math.max(this.bat.velocity - this.bat.acceleration, targetVelocity);
        }
        
        // Update direction only when there's actual movement
        if (Math.abs(this.bat.velocity) > 0.1) {  // Small threshold to avoid jitter
            this.lastBatDirection = this.bat.velocity > 0 ? -1 : 1;
        }
        
        this.bat.x += this.bat.velocity;
        
        // Keep bat within game bounds
        this.bat.x = Math.max(this.viewportOffset, 
                             Math.min(this.bat.x, 
                                    this.viewportOffset + this.canvas.width - this.bat.width));

        // Update viewport based on bat position
        this.updateViewport();

        // Update poops
        this.poops.forEach((poop, index) => {
            if (!poop.grounded && !poop.attached) {
                poop.velocityY += this.gravity;
                poop.x += poop.velocityX;
                poop.y += poop.velocityY;

                // Check for ground collision
                if (poop.y > this.canvas.height - 50) {
                    poop.y = this.canvas.height - 50;
                    poop.grounded = true;
                    poop.groundedTime = Date.now();
                    this.playGroundHitSound();
                    
                    // Only trigger game over if this was the last poop and no ammo left
                    if (this.poopAmmo === 0 && this.poops.filter(p => !p.grounded && !p.attached).length === 0) {
                        this.gameOver = true;
                        setTimeout(() => this.showGameOver(), 1000);
                    }
                }
            } else if (poop.grounded) {
                // Update fade for grounded poops
                const fadeProgress = (Date.now() - poop.groundedTime) / this.poopFadeDuration;
                if (fadeProgress >= 1) {
                    this.poops.splice(index, 1);
                } else {
                    poop.opacity = 1 - fadeProgress;
                }
            }
        });

        // Update hit flash timer (1Hz)
        this.hitFlashTimer = Date.now() / 1000;

        // Update cars
        this.cars.forEach((car, index) => {
            car.x += car.speed;
            
            // Check collision with poops
            if (!car.isHit) {
                this.poops.forEach(poop => {
                    if (!poop.attached && !poop.grounded && this.checkCollision(poop, car)) {
                        this.hitCar(car);
                        poop.attached = true;
                        poop.attachedTo = car;
                    }
                });
            }

            // Check for collisions between cars in the same lane
            if (car.isHit) {
                this.cars.forEach(otherCar => {
                    if (!otherCar.isHit && this.checkCollision(car, otherCar)) {
                        this.hitCar(otherCar);
                    }
                });
            }
            
            // Remove cars that are far off screen
            if (car.x < this.viewportOffset - this.canvas.width || 
                car.x > this.viewportOffset + this.canvas.width * 2) {
                this.cars.splice(index, 1);
            }
        });

        // Spawn new cars
        this.carSpawnTimer++;
        if (this.carSpawnTimer > 60) {
            this.carSpawnTimer = 0;
            if (Math.random() < 0.3) {
                this.spawnCar();
            }
        }

        // Update animation values
        this.animationTime += 0.1;
        this.wingAngle = Math.sin(this.animationTime * 8) * 0.5;
        this.bodyOffset = Math.sin(this.animationTime * 4) * 3;

        // Update star twinkle
        this.stars.forEach(star => {
            star.twinkle += 0.02;
        });

        // Check for content generation
        this.checkContentGeneration();
    }
    
    checkCollision(rect1, rect2) {
        // First check if they're in the same lane (within a small tolerance)
        const LANE_TOLERANCE = 5;  // Allow 5px difference to account for minor variations
        if (Math.abs(rect1.y - rect2.y) > LANE_TOLERANCE) {
            return false;
        }
        
        // Then check horizontal collision
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x;
    }
    
    draw() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw sky gradient
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        skyGradient.addColorStop(0, '#1a2a4a');
        skyGradient.addColorStop(0.7, '#4a6b9a');
        skyGradient.addColorStop(1, '#87CEEB');
        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw stars with twinkle effect
        this.stars.forEach(star => {
            const twinkleFactor = (Math.sin(star.twinkle) + 1) / 2;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${star.baseOpacity * twinkleFactor})`;
            this.ctx.beginPath();
            this.ctx.arc(star.x - this.viewportOffset, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Draw grass strip (extends to cover full tree area)
        const maxTreeHeight = 100;
        const grassHeight = (maxTreeHeight + 120) / 2;
        this.ctx.fillStyle = '#2d5a27';
        this.ctx.fillRect(0, this.canvas.height - 80 - grassHeight, this.canvas.width, grassHeight);
        
        // Draw road
        this.ctx.fillStyle = '#333333';
        this.ctx.fillRect(0, this.canvas.height - 80, this.canvas.width, 80);

        // Sort trees by y position (higher y = lower on screen)
        const sortedTrees = [...this.trees].sort((a, b) => a.y - b.y);

        // Draw trees in order from back to front
        sortedTrees.forEach(tree => {
            const x = tree.x - this.viewportOffset;
            const scale = tree.size;
            
            if (this.imagesLoaded.pine && this.pineImage) {
                const treeWidth = 60 * scale * 2;
                const treeHeight = 150 * scale * 2;
                this.ctx.drawImage(
                    this.pineImage,
                    x - (treeWidth/4),
                    this.canvas.height - 80 - treeHeight/2 - tree.y,
                    treeWidth/2,
                    treeHeight/2
                );
            } else {
                // Fallback tree drawing code...
            }
        });

        // Draw poops with fade effect
        this.poops.forEach(poop => {
            this.ctx.save();
            if (poop.grounded) {
                // Calculate fade based on time since grounding
                const fadeProgress = (Date.now() - poop.groundedTime) / this.poopFadeDuration;
                // Use a non-linear fade curve for more natural fading
                poop.opacity = Math.pow(1 - fadeProgress, 2);
            }
            this.ctx.globalAlpha = poop.opacity;
            
            if (this.imagesLoaded.poop && this.poopImage) {
                this.ctx.drawImage(
                    this.poopImage,
                    poop.x - this.viewportOffset - poop.width/2,
                    poop.y - poop.height/2,
                    poop.width * 2,
                    poop.height * 2
                );
            } else {
                // Fallback poop drawing code...
            }
            this.ctx.restore();
        });

        // Sort cars by y position (higher y = lower on screen = drawn later)
        const sortedCars = [...this.cars].sort((a, b) => a.y - b.y);

        // Draw cars in order from back to front
        sortedCars.forEach(car => {
            this.drawCar(car);
        });

        // Draw all active explosions
        this.explosions = this.explosions.filter(explosion => !explosion.isComplete);
        this.explosions.forEach(explosion => {
            explosion.draw(this.ctx, this.viewportOffset);
        });

        // Draw bat
        if (this.imagesLoaded.bat && this.batImage) {
            this.ctx.save();
            this.ctx.translate(this.bat.x - this.viewportOffset + this.bat.width/2, this.bat.y + this.bat.height/2 + this.bodyOffset);
            
            // Use lastBatDirection instead of current velocity
            this.ctx.scale(this.lastBatDirection, 1);
            
            // Enable image smoothing for higher quality scaling
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
            
            // Draw wings with adjusted orientation based on bat direction
            if (this.imagesLoaded.wing && this.wingImage) {
                const wingWidth = this.bat.width * 0.63;   // Width
                const wingHeight = this.bat.width * 0.42;  // Base height
                const scaleX = 8;  // Scale to render at 200px wide (25 * 8 = 200)
                const scaleY = 4;  // Scale to render at 100px high (25 * 4 = 100)
                const wingDistance = this.bat.width * 1;  // Distance from center
                const verticalOffset = wingHeight * scaleY * 0.1 + 25;  // Vertical offset
                const wingVerticalShift = -25;  // Move wings up relative to axis
                
                // Left wing
                this.ctx.save();
                this.ctx.translate(-wingDistance, -verticalOffset);
                this.ctx.rotate(-this.wingAngle);
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(
                    this.wingImage,
                    -wingWidth * scaleX * 0.2,
                    -wingHeight * scaleY/2 + verticalOffset + wingVerticalShift,
                    wingWidth * scaleX,
                    wingHeight * scaleY
                );
                this.ctx.restore();
                
                // Right wing
                this.ctx.save();
                this.ctx.translate(wingDistance, -verticalOffset);
                this.ctx.rotate(this.wingAngle);
                this.ctx.scale(1, 1);
                this.ctx.drawImage(
                    this.wingImage,
                    -wingWidth * scaleX * 0.2,
                    -wingHeight * scaleY/2 + verticalOffset + wingVerticalShift,
                    wingWidth * scaleX,
                    wingHeight * scaleY
                );
                this.ctx.restore();
            }
            
            // Draw bat body at high resolution and scale down
            const scale = 4;  // Scale to render at 100px (25 * 4 = 100)
            this.ctx.drawImage(
                this.batImage,
                -(this.bat.width * scale)/2,
                -(this.bat.height * scale)/2 - 40,
                this.bat.width * scale,
                this.bat.height * scale
            );
            this.ctx.restore();
        } else {
            // Fallback rectangle if image not loaded
            this.ctx.fillStyle = '#4a4a4a';
            this.ctx.fillRect(
                this.bat.x - this.viewportOffset,
                this.bat.y + this.bodyOffset,
                this.bat.width,
                this.bat.height
            );
        }

        // Draw ammo counter
        if (this.imagesLoaded.poop && this.poopImage) {
            const poopSize = 30;
            const padding = 5;
            const startX = 10;
            const startY = 10;
            const spacing = poopSize + padding;
            
            // Draw background for ammo counter
            const totalWidth = spacing * this.maxPoopAmmo - padding;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.roundRect(
                startX - padding,
                startY - padding,
                totalWidth + padding * 2,
                poopSize + padding * 2,
                8
            );
            this.ctx.fill();
            
            // Draw poop icons
            for (let i = 0; i < this.poopAmmo; i++) {
                this.ctx.drawImage(
                    this.poopImage,
                    startX + spacing * i,
                    startY,
                    poopSize,
                    poopSize
                );
            }
            
            // Draw empty slots
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            for (let i = this.poopAmmo; i < this.maxPoopAmmo; i++) {
                this.ctx.beginPath();
                this.ctx.arc(
                    startX + spacing * i + poopSize/2,
                    startY + poopSize/2,
                    poopSize/3,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
            }
        } else {
            // Fallback text ammo counter
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`Ammo: ${this.poopAmmo}`, 10, 30);
        }

        // Draw game over screen if game is over
        if (this.gameOver) {
            this.showGameOver();
        }

        // Draw pause overlay if game is paused
        if (this.isPaused) {
            this.ctx.save();
            // Semi-transparent grey overlay
            this.ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // PAUSED text
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('PAUSED', this.canvas.width/2, this.canvas.height/2);
            
            // Add drop shadow for better visibility
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 2;
            this.ctx.shadowOffsetY = 2;
            this.ctx.fillText('PAUSED', this.canvas.width/2, this.canvas.height/2);
            this.ctx.restore();
        }
    }
    
    gameLoop() {
        if (!this.isPaused) {
            this.update();
        }
        this.draw();  // Always draw even when paused
        requestAnimationFrame(() => this.gameLoop());
    }
    
    start() {
        // Generate initial content if not already done
        if (this.stars.length === 0) {
            this.generateInitialContent();
        }
        
        // Start the game loop
        this.gameLoop();
    }
    
    playGroundHitSound() {
        try {
            if (this.audioContext.state !== 'running') {
                this.audioContext.resume();
            }

            const osc = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Lower, duller sound for ground hit
            osc.type = 'sine';
            const now = this.audioContext.currentTime;
            
            osc.frequency.setValueAtTime(100, now);
            gainNode.gain.setValueAtTime(0.3, now);
            
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            
            osc.start(now);
            osc.stop(now + 0.3);
        } catch (e) {
            console.error('Error playing ground hit sound:', e);
        }
    }

    playCarHitSound() {
        try {
            // Play both hit and explosion sounds
            if (this.hitSound && this.explosionSound) {
                // Reset and play hit sound
                this.hitSound.currentTime = 0;
                this.hitSound.play().catch(e => {
                    console.error('Error playing hit sound:', e);
                });
                
                // Reset and play explosion sound
                this.explosionSound.currentTime = 0;
                this.explosionSound.play().catch(e => {
                    console.error('Error playing explosion sound:', e);
                });
            } else {
                // Fallback to synthesized sound if audio files fail
                this.playFallbackCarHitSound();
            }
        } catch (e) {
            console.error('Error playing car hit sounds:', e);
            this.playFallbackCarHitSound();
        }
    }

    playFallbackCarHitSound() {
        try {
            if (this.audioContext && this.audioContext.state === 'running') {
                const osc = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                osc.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                // Higher pitched, more impactful sound for car hit
                osc.type = 'square';
                const now = this.audioContext.currentTime;
                
                osc.frequency.setValueAtTime(300, now);
                gainNode.gain.setValueAtTime(0.4, now);
                
                osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                
                osc.start(now);
                osc.stop(now + 0.15);
            }
        } catch (e) {
            console.error('Error playing fallback car hit sound:', e);
        }
    }

    hitCar(car) {
        if (!car.isHit) {
            car.isHit = true;
            car.hitTime = Date.now();
            
            // Create new explosion at car's position
            const explosionSize = car.width * 2.25;  // Increased by 50% (from 1.5 to 2.25)
            this.explosions.push(new Explosion(
                car.x + car.width/2,
                car.y + car.height/2,
                explosionSize
            ));
            
            const hitSpeed = this.baseCarSpeed * this.speedMultiplier * this.HIT_SPEED_MULTIPLIER;
            car.speed = car.speed > 0 ? hitSpeed : -hitSpeed;
            this.score += 100;
            this.poopAmmo = this.maxPoopAmmo;
            document.getElementById('scoreValue').textContent = this.score;
            this.playCarHitSound();
        }
    }

    showGameOver() {
        this.ctx.save();
        // Semi-transparent black overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Game Over text
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('GAME OVER', this.canvas.width/2, this.canvas.height/2 - 30);
        
        // Score text
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width/2, this.canvas.height/2 + 20);
        
        // Restart instruction
        this.ctx.font = '20px Arial';
        this.ctx.fillText('Press SPACE to restart', this.canvas.width/2, this.canvas.height/2 + 60);
        this.ctx.restore();
    }

    restartGame() {
        // Clean up explosion worker
        Explosion.cleanup();
        
        // Reset game state
        this.score = 0;
        document.getElementById('scoreValue').textContent = '0';
        this.poopAmmo = this.maxPoopAmmo;
        this.gameOver = false;
        this.poops = [];
        this.cars = [];
        this.explosions = [];
        
        // Reset bat position
        this.bat.x = this.canvas.width / 2;
        this.bat.y = 100;
        this.bat.velocity = 0;
        
        // Reset viewport
        this.viewportOffset = 0;
        this.worldBounds = {
            left: -this.canvas.width,
            right: this.canvas.width * 2
        };
        
        // Clear existing scene
        this.trees = [];
        this.stars = [];
        
        // Generate new scene
        this.generateInitialContent();
        
        // Reset animation values
        this.animationTime = 0;
        this.wingAngle = 0;
        this.bodyOffset = 0;
        
        // Reset speed multiplier
        this.speedMultiplier = 1;
        
        // Unpause if paused
        this.isPaused = false;
    }

    generateStarsForRange(startX, endX) {
        if (startX >= endX) return [];  // Prevent invalid ranges
        
        const width = endX - startX;
        const height = this.canvas.height * 0.7;  // Stars in top 70% of screen
        const area = width * height;
        const starCount = Math.floor(area * this.STAR_DENSITY);
        
        return Array(starCount).fill().map(() => ({
            x: startX + Math.random() * width,
            y: Math.random() * height,
            size: 0.5 + Math.random() * 1.5,
            twinkle: Math.random() * Math.PI,
            baseOpacity: 0.3 + (1 - (Math.random() * height / height)) * 0.7  // Higher stars are brighter
        }));
    }

    generateTreesForRange(startX, endX) {
        if (startX >= endX) return [];
        
        const width = endX - startX;
        // Ensure at least 2 trees per screen width
        const minTrees = Math.max(2, Math.floor(width / this.TREE_SPACING));
        const maxTrees = Math.floor(width / this.MIN_TREE_SPACING);
        const treeCount = minTrees + Math.floor(Math.random() * (maxTrees - minTrees + 1));
        
        const trees = [];
        const segmentWidth = width / treeCount;
        
        for (let i = 0; i < treeCount; i++) {
            const baseX = startX + (i * segmentWidth);
            // Limit random offset to maintain minimum spacing
            const maxOffset = Math.min(segmentWidth * 0.4, this.MIN_TREE_SPACING * 0.4);
            const randomOffset = (Math.random() - 0.5) * maxOffset;
            
            trees.push({
                x: baseX + randomOffset,
                y: Math.random() * 100,  // Random height above street
                size: 0.7 + Math.random() * 0.6  // Size between 0.7 and 1.3
            });
        }
        
        return trees;
    }

    checkContentGeneration() {
        const viewportLeft = this.viewportOffset;
        const viewportRight = viewportLeft + this.canvas.width;
        const viewportMovement = Math.abs(viewportLeft - this.lastViewportPosition);
        
        // Get current visible trees
        const visibleTrees = this.trees.filter(tree => 
            tree.x >= viewportLeft && 
            tree.x <= viewportRight
        );
        
        // Generate trees if we've moved enough OR if we don't have enough visible trees
        if (viewportMovement > this.MIN_TREE_SPACING/2 || visibleTrees.length < 2) {
            const movementDirection = viewportLeft - this.lastViewportPosition > 0 ? -1 : 1;
            const generationWidth = Math.max(viewportMovement, this.canvas.width/2);
            
            if (movementDirection > 0) {  // Moving left, generate right
                const newTrees = this.generateTreesForRange(
                    viewportRight,
                    viewportRight + generationWidth
                );
                this.trees.push(...newTrees);
            } else {  // Moving right, generate left
                const newTrees = this.generateTreesForRange(
                    viewportLeft - generationWidth,
                    viewportLeft
                );
                this.trees.unshift(...newTrees);
            }
            
            this.lastViewportPosition = viewportLeft;
        }

        // Handle star generation
        const generationBuffer = this.canvas.width;
        if (viewportRight + generationBuffer > this.worldBounds.right) {
            const newStars = this.generateStarsForRange(this.worldBounds.right, viewportRight + generationBuffer);
            this.stars.push(...newStars);
            this.worldBounds.right = viewportRight + generationBuffer;
        }
        
        if (viewportLeft - generationBuffer < this.worldBounds.left) {
            const newStars = this.generateStarsForRange(viewportLeft - generationBuffer, this.worldBounds.left);
            this.stars.unshift(...newStars);
            this.worldBounds.left = viewportLeft - generationBuffer;
        }

        // Clean up out-of-view content
        const cleanupBuffer = this.canvas.width;
        this.trees = this.trees.filter(tree => 
            tree.x >= viewportLeft - cleanupBuffer && 
            tree.x <= viewportRight + cleanupBuffer
        );
        
        this.stars = this.stars.filter(star => 
            star.x >= viewportLeft - cleanupBuffer && 
            star.x <= viewportRight + cleanupBuffer
        );
    }

    generateContentForRange(startX, endX) {
        if (startX >= endX) return { stars: [], trees: [] };  // Prevent invalid ranges
        
        return {
            stars: this.generateStarsForRange(startX, endX),
            trees: this.generateTreesForRange(startX, endX)
        };
    }

    cleanupContent(viewportLeft, viewportRight) {
        // Keep content within the viewport buffer, but not too aggressively
        this.trees = this.trees.filter(tree => 
            tree.x >= viewportLeft - this.canvas.width && 
            tree.x <= viewportRight + this.canvas.width
        );

        this.stars = this.stars.filter(star => 
            star.x >= viewportLeft - this.canvas.width && 
            star.x <= viewportRight + this.canvas.width
        );
    }

    generateInitialContent() {
        // Generate content for 4 screen widths centered on starting position
        const startX = -this.canvas.width * 2;
        const endX = this.canvas.width * 2;
        
        const initialContent = this.generateContentForRange(startX, endX);
        this.trees = initialContent.trees;
        this.stars = initialContent.stars;
        
        // Set initial world bounds
        this.worldBounds.left = startX;
        this.worldBounds.right = endX;
    }

    updateViewport() {
        const viewportThreshold = this.canvas.width * 0.25;
        const batViewportX = this.bat.x - this.viewportOffset;

        if (batViewportX < viewportThreshold) {
            this.viewportOffset = this.bat.x - viewportThreshold;
        } else if (batViewportX > this.canvas.width - viewportThreshold) {
            this.viewportOffset = this.bat.x - (this.canvas.width - viewportThreshold);
        }

        // Check for content generation every viewport update
        this.checkContentGeneration();
    }

    // Add method to update key mapping
    updateKeyMap(action, key) {
        // Remove old key binding from keys object
        const oldKey = this.keyMap[action];
        if (oldKey in this.keys) {
            delete this.keys[oldKey];
        }
        
        // Update to new key binding
        this.keyMap[action] = key;
        this.keys[key] = false;  // Initialize new key state
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const scale = Math.min(containerWidth / 800, containerHeight / 600);
        
        this.canvas.style.width = `${800 * scale}px`;
        this.canvas.style.height = `${600 * scale}px`;
    }

    isTouchOnBat(x, y) {
        const batBounds = {
            left: this.bat.x,
            right: this.bat.x + this.bat.width,
            top: this.bat.y,
            bottom: this.bat.y + this.bat.height
        };

        // Add some padding for easier touch targeting
        const padding = 20;
        return x >= batBounds.left - padding &&
               x <= batBounds.right + padding &&
               y >= batBounds.top - padding &&
               y <= batBounds.bottom + padding;
    }

    drawCar(car) {
        this.ctx.save();
        
        // Draw the car
        if (this.imagesLoaded.car && this.carImage) {
            this.ctx.translate(car.x - this.viewportOffset + car.width/2, car.y + car.height/2);
            
            // Flip car based on direction
            this.ctx.scale(car.speed > 0 ? -1 : 1, 1);
            this.ctx.translate(-car.width/2, -car.height/2);
            
            // Draw the car image
            this.ctx.drawImage(this.carImage, 0, 0, car.width, car.height);
            
            // Flash red if hit
            if (car.isHit) {
                const shouldFlash = Math.floor(this.hitFlashTimer * this.FLASH_FREQUENCY) % 2 === 0;
                if (shouldFlash) {
                    this.ctx.globalCompositeOperation = 'multiply';
                    this.ctx.fillStyle = '#FF0000';
                    this.ctx.fillRect(0, 0, car.width, car.height);
                    
                    this.ctx.globalCompositeOperation = 'screen';
                    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                    this.ctx.fillRect(0, 0, car.width, car.height);
                }
            }
            
            this.ctx.restore();
        } else {
            // Fallback rectangle if image not loaded
            this.ctx.fillStyle = car.isHit ? 
                (Math.floor(this.hitFlashTimer * this.FLASH_FREQUENCY) % 2 === 0 ? '#FF0000' : car.color.dark) : 
                car.color.base;
            this.ctx.fillRect(car.x - this.viewportOffset, car.y, car.width, car.height);
            this.ctx.restore();
        }
    }

    async loadExplosionGif() {
        try {
            const response = await fetch('/static/explosion.gif');
            const buffer = await response.arrayBuffer();
            const frames = await this.analyzeGif(buffer);
            
            this.explosionFrames = frames;
            this.EXPLOSION_TOTAL_FRAMES = frames.length;
            this.EXPLOSION_FRAME_DURATION = frames[0].delay;  // Assuming consistent delays
            this.EXPLOSION_DURATION = frames.reduce((sum, frame) => sum + frame.delay, 0);
            
            console.log(`Explosion GIF loaded: ${this.EXPLOSION_TOTAL_FRAMES} frames, ${this.EXPLOSION_FRAME_DURATION}ms per frame`);
            this.imagesLoaded.explosion = true;
        } catch (error) {
            console.error('Error loading explosion GIF:', error);
        }
    }

    async analyzeGif(arrayBuffer) {
        // We'll use a simple GIF parser to extract frame information
        const view = new DataView(arrayBuffer);
        const frames = [];
        let offset = 13; // Skip GIF header and logical screen descriptor
        
        // Skip global color table if present
        if ((view.getUint8(10) & 0x80) !== 0) {
            const colorTableSize = Math.pow(2, (view.getUint8(10) & 0x07) + 1) * 3;
            offset += colorTableSize;
        }
        
        while (offset < arrayBuffer.byteLength) {
            const marker = view.getUint8(offset);
            
            if (marker === 0x21) { // Extension block
                const extType = view.getUint8(offset + 1);
                
                if (extType === 0xF9) { // Graphics Control Extension
                    const delay = view.getUint16(offset + 4, true) * 10; // Convert to milliseconds
                    frames.push({ delay: delay || 100 }); // Use 100ms if delay is 0
                }
                
                // Skip to next block
                offset += 2;
                while (true) {
                    const size = view.getUint8(offset);
                    offset += 1;
                    if (size === 0) break;
                    offset += size;
                }
            } else if (marker === 0x2C) { // Image block
                // Skip image descriptor and local color table
                const hasLocalColorTable = (view.getUint8(offset + 9) & 0x80) !== 0;
                offset += 10;
                if (hasLocalColorTable) {
                    const colorTableSize = Math.pow(2, (view.getUint8(offset - 1) & 0x07) + 1) * 3;
                    offset += colorTableSize;
                }
                
                // Skip image data
                offset += 1;
                while (true) {
                    const size = view.getUint8(offset);
                    offset += 1;
                    if (size === 0) break;
                    offset += size;
                }
            } else if (marker === 0x3B) { // End of GIF
                break;
            } else {
                offset += 1;
            }
        }
        
        return frames;
    }
}

class Explosion {
    static worker = null;
    static nextId = 0;
    
    constructor(x, y, size) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.id = Explosion.nextId++;
        this.isComplete = false;
        this.progress = 0;
        this.duration = 1000;  // Duration in milliseconds
        
        // Create explosion image
        this.image = new Image();
        this.image.src = `/static/explosion.gif?t=${Date.now()}`;
        
        // Initialize worker if not exists
        if (!Explosion.worker) {
            Explosion.worker = new Worker('/static/js/explosion-worker.js');
            Explosion.worker.onmessage = (e) => {
                const { id, type, progress } = e.data;
                // Find the explosion with this ID
                const explosion = window.game.explosions.find(exp => exp.id === id);
                if (explosion) {
                    if (type === 'complete') {
                        explosion.isComplete = true;
                    } else if (type === 'update') {
                        explosion.progress = progress;
                    }
                }
            };
        }
        
        // Start the explosion animation in the worker
        Explosion.worker.postMessage({
            id: this.id,
            duration: this.duration
        });
    }

    draw(ctx, viewportOffset) {
        if (this.isComplete) return;
        
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        
        // Apply scaling based on progress
        const scale = 1 + (this.progress * 0.2); // Grow by 20% over duration
        const scaledSize = this.size * scale;
        
        ctx.drawImage(
            this.image,
            this.x - viewportOffset - scaledSize/2,
            this.y - scaledSize/2,
            scaledSize,
            scaledSize
        );
        ctx.restore();
    }
    
    static cleanup() {
        if (Explosion.worker) {
            Explosion.worker.terminate();
            Explosion.worker = null;
        }
    }
}

// Start the game when the page loads
window.onload = () => {
    const game = new Game();
    window.game = game;  // Expose game instance globally
    game.start();
}; 