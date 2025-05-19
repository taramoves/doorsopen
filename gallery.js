document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.getElementById('gallery-container');
    const dances = JSON.parse(localStorage.getItem('dances')) || [];
  
    dances.forEach(dance => {
      const dancerEl = document.createElement('div');
      dancerEl.className = 'dancer';
      dancerEl.style.transform = `scale(${dance.scale})`;
      
      // Animate frames
      let currentFrame = 0;
      const img = document.createElement('img');
      dancerEl.appendChild(img);
      
      setInterval(() => {
        currentFrame = (currentFrame + 1) % dance.frames.length;
        img.src = dance.frames[currentFrame];
      }, 100); // 10fps animation
      
      // Position and movement
      let x = random(0, window.innerWidth - 200);
      let y = random(0, window.innerHeight - 200);
      let speedX = dance.speedX;
      let speedY = dance.speedY;
      
      function updatePosition() {
        x += speedX;
        y += speedY;
        
        // Bounce off walls
        if (x <= 0 || x >= window.innerWidth - 200) speedX *= -1;
        if (y <= 0 || y >= window.innerHeight - 200) speedY *= -1;
        
        dancerEl.style.left = `${x}px`;
        dancerEl.style.top = `${y}px`;
        requestAnimationFrame(updatePosition);
      }
      
      updatePosition();
      gallery.appendChild(dancerEl);
    });
  });

  // In gallery.js - Load from localStorage
function loadDances() {
    return JSON.parse(localStorage.getItem('dances')) || [];
  }