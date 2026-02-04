export function initGame() {
    const canvas = document.getElementById('game-canvas');
    const overlay = document.getElementById('game-overlay');

    if (!canvas || !overlay) return;

    const ctx = canvas.getContext('2d');

    // Set canvas size
    const container = document.getElementById('game-container');

    function resize() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (!isPlaying) {
             player.y = canvas.height - groundHeight - player.height;
             draw();
        }
    }

    window.addEventListener('resize', resize);

    // Game State
    let isPlaying = false;
    let gameOver = false;
    let score = 0;
    let speed = 5;
    let animationId;

    // Player
    const player = {
        x: 50,
        y: 0,
        width: 40,
        height: 40,
        vy: 0,
        jumpStrength: -12,
        gravity: 0.6,
        grounded: false
    };

    // Ground
    const groundHeight = 50;

    // Obstacles
    let obstacles = [];
    const obstacleTypes = ['BUG', 'EXCEPTION', '404', 'NULL', 'SEGFAULT'];
    let nextObstacleTimer = 0;

    // Input Handling
    function handleJump() {
        if (!isPlaying && !gameOver) {
            startGame();
            return;
        }
        if (gameOver) {
            resetGame();
            startGame(); // Auto restart
            return;
        }
        if (player.grounded) {
            player.vy = player.jumpStrength;
            player.grounded = false;
        }
    }

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault(); // Prevent scrolling
            handleJump();
        }
    });

    canvas.addEventListener('click', handleJump);
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleJump();
    });


    function startGame() {
        if (isPlaying) return;
        isPlaying = true;
        overlay.classList.add('hidden');
        loop();
    }

    function resetGame() {
        isPlaying = false;
        gameOver = false;
        score = 0;
        speed = 5;
        obstacles = [];
        player.y = canvas.height - groundHeight - player.height;
        player.vy = 0;
        overlay.classList.remove('hidden');
        overlay.querySelector('.game-title').textContent = "CODE QUEST: ESCAPE THE VOID";
        overlay.querySelector('.game-start-msg').textContent = "PRESS SPACE TO START";
        draw();
    }

    function spawnObstacle() {
        const text = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
        ctx.font = 'bold 20px "Courier New", monospace';
        const textWidth = ctx.measureText(text).width;

        obstacles.push({
            x: canvas.width,
            y: canvas.height - groundHeight - 40,
            text: text,
            width: textWidth + 20,
            height: 40,
            marked: false
        });
    }

    function update() {
        if (!isPlaying) return;

        // Player Physics
        player.vy += player.gravity;
        player.y += player.vy;

        // Ground Collision
        if (player.y + player.height > canvas.height - groundHeight) {
            player.y = canvas.height - groundHeight - player.height;
            player.vy = 0;
            player.grounded = true;
        } else {
            player.grounded = false;
        }

        // Obstacles
        nextObstacleTimer--;
        if (nextObstacleTimer <= 0) {
            spawnObstacle();
            nextObstacleTimer = Math.random() * 60 + 60; // Random interval
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            let ob = obstacles[i];
            ob.x -= speed;

            // Collision Detection (AABB)
            // Slightly smaller hit box for player forgiveness
            if (
                player.x + 5 < ob.x + ob.width &&
                player.x + player.width - 5 > ob.x &&
                player.y + 5 < ob.y + ob.height &&
                player.y + player.height - 5 > ob.y
            ) {
                gameOver = true;
                isPlaying = false;
                overlay.classList.remove('hidden');
                overlay.querySelector('.game-title').textContent = "SYSTEM FAILURE";
                overlay.querySelector('.game-start-msg').textContent = `SCORE: ${score} // PRESS SPACE TO REBOOT`;
                cancelAnimationFrame(animationId);
                return;
            }

            // Remove off-screen
            if (ob.x + ob.width < 0) {
                obstacles.splice(i, 1);
                score++;
                if(score % 5 === 0) speed += 0.5; // Increase difficulty
            }
        }
    }

    function draw() {
        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Grid Background (Optional effect)
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.1)';
        ctx.lineWidth = 1;

        // Draw Ground
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);
        ctx.strokeStyle = '#00FF41';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - groundHeight);
        ctx.lineTo(canvas.width, canvas.height - groundHeight);
        ctx.stroke();

        // Draw Player (Cyberpunk Character)
        ctx.fillStyle = '#00FF41';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00FF41';
        ctx.fillRect(player.x, player.y, player.width, player.height);
        ctx.shadowBlur = 0;

        // Character Details
        ctx.fillStyle = '#000';
        // Visor
        ctx.fillRect(player.x + 25, player.y + 10, 15, 5);

        // Draw Obstacles
        ctx.font = 'bold 20px "Courier New", monospace';
        for (let ob of obstacles) {
            // Box
            ctx.strokeStyle = '#FF0055'; // Red/Pink for danger
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#FF0055';
            ctx.strokeRect(ob.x, ob.y, ob.width, ob.height);
            ctx.shadowBlur = 0;

            // Text
            ctx.fillStyle = '#FF0055';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ob.text, ob.x + ob.width/2, ob.y + ob.height/2);
        }

        // Draw Score
        ctx.fillStyle = '#00FF41';
        ctx.font = '20px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`SCORE: ${score}`, 20, 20);

        if (isPlaying) {
             animationId = requestAnimationFrame(loop);
        }
    }

    function loop() {
        update();
        draw();
    }

    // Initial Setup
    resize();
}
