// Gallery View Management
document.addEventListener('DOMContentLoaded', function() {
  const galleryContainer = document.getElementById('gallery-container');
  
  // Load gallery immediately since we're on the gallery page
  loadGallery();
  
  // Functions to save and load silhouettes
  window.saveToLocalStorage = function(dance) {
    try {
      // Get existing dances or initialize empty array
      const dances = JSON.parse(localStorage.getItem('dances') || '[]');
      
      // Enforce a maximum number of saved dances to prevent quota issues
      const MAX_SAVED_DANCES = 10; // Maximum number of dance groups (each group has original + silhouette)
      
      // Group by ID to count unique dances (not counting original/silhouette pairs)
      const uniqueIds = new Set(dances.map(d => d.id));
      
      // If we're exceeding the limit, remove oldest dances
      if (uniqueIds.size >= MAX_SAVED_DANCES) {
        // Get all IDs sorted by timestamp (oldest first)
        const sortedIds = Array.from(uniqueIds).sort((a, b) => a - b);
        
        // Number of IDs to remove
        const idsToRemove = Math.max(1, sortedIds.length - MAX_SAVED_DANCES + 1);
        
        // Get IDs to remove (oldest ones)
        const removeIds = sortedIds.slice(0, idsToRemove);
        
        console.log(`Storage limit reached. Removing ${removeIds.length} oldest dance(s).`);
        
        // Filter out the dances with those IDs
        const filteredDances = dances.filter(d => !removeIds.includes(d.id));
        
        // Update the dances array
        localStorage.setItem('dances', JSON.stringify(filteredDances));
        
        // Now add the new dance
        filteredDances.push(dance);
        localStorage.setItem('dances', JSON.stringify(filteredDances));
      } else {
        // Just add the new dance normally
        dances.push(dance);
        localStorage.setItem('dances', JSON.stringify(dances));
      }
      
      console.log(`Saved ${dance.type || 'dance'} with ${dance.frames.length} frames to localStorage`);
      return dance;
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      
      // Handle quota exceeded error specifically
      if (error.name === 'QuotaExceededError') {
        alert("Storage limit reached! The oldest saved dance has been removed to make space. Try saving again.");
        
        // Emergency cleanup - remove the oldest dance entirely
        const dances = JSON.parse(localStorage.getItem('dances') || '[]');
        if (dances.length > 0) {
          // Sort by timestamp/id and remove the oldest
          dances.sort((a, b) => a.id - b.id);
          const removedId = dances[0].id;
          const filteredDances = dances.filter(d => d.id !== removedId);
          localStorage.setItem('dances', JSON.stringify(filteredDances));
          
          console.log(`Emergency cleanup: Removed dance with ID ${removedId}`);
        }
      }
      
      return null;
    }
  };
  
  window.loadGallery = function(showType = 'silhouette') {
    // Clear existing gallery items
    galleryContainer.innerHTML = '';
    
    // Get dances from localStorage
    const allDances = JSON.parse(localStorage.getItem('dances') || '[]');
    
    // Filter by type - by default show only silhouettes
    const dances = allDances.filter(dance => {
      if (showType === 'all') return true;
      return dance.type === showType || (!dance.type && showType === 'silhouette');
    });
    
    // Create buttons to toggle view types
    const filterControls = document.createElement('div');
    filterControls.className = 'filter-controls';
    filterControls.innerHTML = `
      <button class="filter-btn ${showType === 'silhouette' ? 'active' : ''}" data-type="silhouette">Silhouettes</button>
      <button class="filter-btn ${showType === 'original' ? 'active' : ''}" data-type="original">Original Videos</button>
      <button class="filter-btn ${showType === 'all' ? 'active' : ''}" data-type="all">Show All</button>
    `;
    
    filterControls.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        if (type === 'all') {
          loadGallery('all');
        } else {
          loadGallery(type);
        }
      });
    });
    
    galleryContainer.appendChild(filterControls);
    
    if (dances.length === 0) {
      galleryContainer.innerHTML += '<p>No silhouettes saved yet. Record and save some moves!</p>';
      return;
    }
    
    // Group by id to show related pairs together
    const dancesById = {};
    dances.forEach(dance => {
      if (!dancesById[dance.id]) {
        dancesById[dance.id] = [];
      }
      dancesById[dance.id].push(dance);
    });
    
    // Create gallery items container
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'gallery-items';
    galleryContainer.appendChild(itemsContainer);
    
    // Create gallery items
    Object.values(dancesById).forEach(danceGroup => {
      // Sort by type so silhouette is first if available
      danceGroup.sort((a, b) => {
        if (a.type === 'silhouette') return -1;
        if (b.type === 'silhouette') return 1;
        return 0;
      });
      
      // Use the first dance in the group (preferring silhouette)
      const dance = danceGroup[0];
      
      // Create gallery item
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.setAttribute('data-id', dance.id);
      
      // Determine if this is a silhouette or original
      const typeLabel = dance.type || 'dance';
      const hasTransparency = dance.hasTransparency || false;
      
      // Create animated thumbnail that loops
      const thumbnail = document.createElement('div');
      thumbnail.className = 'gallery-thumbnail animated';
      if (typeLabel === 'silhouette' && !hasTransparency) {
        thumbnail.style.backgroundColor = '#00ff00'; // Green background for non-transparent silhouettes
      }
      
      // Create a mini-player inside the thumbnail
      let currentFrameIndex = 0;
      const thumbImg = document.createElement('img');
      thumbImg.src = dance.frames[0]; // First frame initially
      thumbnail.appendChild(thumbImg);
      
      // Auto-play the thumbnail in a loop
      const thumbnailInterval = setInterval(() => {
        currentFrameIndex = (currentFrameIndex + 1) % dance.frames.length;
        thumbImg.src = dance.frames[currentFrameIndex];
      }, 100); // ~10fps for thumbnails
      
      // Create info section
      const info = document.createElement('div');
      info.className = 'gallery-info';
      
      // Format date 
      const date = new Date(dance.timestamp || dance.id);
      const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      
      info.innerHTML = `
        <div class="type-badge ${typeLabel}">${typeLabel}</div>
        <div>Frames: ${dance.frames.length}</div>
        <div>Created: ${dateStr}</div>
      `;
      
      // Create buttons
      const buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'gallery-buttons';
      
      // Play button
      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play';
      playBtn.className = 'gallery-play-btn';
      playBtn.addEventListener('click', () => {
        playAnimation(dance);
      });
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'gallery-delete-btn';
      deleteBtn.addEventListener('click', () => {
        deleteAnimation(dance.id);
        item.remove(); // Remove from DOM
        
        // Remove interval for this thumbnail
        clearInterval(thumbnailInterval);
      });
      
      // Add buttons
      buttonsDiv.appendChild(playBtn);
      buttonsDiv.appendChild(deleteBtn);
      
      // Add elements to item
      item.appendChild(thumbnail);
      item.appendChild(info);
      item.appendChild(buttonsDiv);
      
      // Add to gallery
      itemsContainer.appendChild(item);
    });
  };
  
  // Function to delete an animation and any related ones with the same ID
  function deleteAnimation(id) {
    const dances = JSON.parse(localStorage.getItem('dances') || '[]');
    const filtered = dances.filter(dance => dance.id !== id);
    localStorage.setItem('dances', JSON.stringify(filtered));
    console.log(`Deleted animation with ID ${id}`);
  }
  
  // Function to play animation
  function playAnimation(dance) {
    // Create a modal for playback
    const modal = document.createElement('div');
    modal.className = 'playback-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'playback-content';
    
    // Type label
    const typeLabel = dance.type || 'silhouette';
    const hasTransparency = dance.hasTransparency || false;
    
    // Create a player element
    const player = document.createElement('div');
    player.className = 'modal-player';
    if (typeLabel === 'silhouette' && !hasTransparency) {
      player.style.backgroundColor = '#00ff00'; // Green background for non-transparent silhouettes
    }
    
    // Player image
    const playerImg = document.createElement('img');
    playerImg.src = dance.frames[0];
    player.appendChild(playerImg);
    
    // Controls
    const controls = document.createElement('div');
    controls.className = 'modal-controls';
    
    // Play/pause button
    const playBtn = document.createElement('button');
    playBtn.textContent = 'Pause';
    playBtn.className = 'modal-play-btn';
    
    // Speed control
    const speedSelector = document.createElement('select');
    speedSelector.className = 'speed-selector';
    const speeds = [
      { value: 0.5, label: '0.5x Speed' },
      { value: 1, label: '1x Speed' },
      { value: 2, label: '2x Speed' }
    ];
    speeds.forEach(speed => {
      const option = document.createElement('option');
      option.value = speed.value;
      option.textContent = speed.label;
      if (speed.value === 1) option.selected = true;
      speedSelector.appendChild(option);
    });
        
    // Background color control for silhouettes
    let bgColorInput = null;
    if (typeLabel === 'silhouette' && hasTransparency) {
      bgColorInput = document.createElement('input');
      bgColorInput.type = 'color';
      bgColorInput.className = 'bg-color-input';
      bgColorInput.value = '#000000';
      
      bgColorInput.addEventListener('input', () => {
        player.style.backgroundColor = bgColorInput.value;
      });
      
      // Set initial background
      player.style.backgroundColor = '#000000';
    }
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'modal-close-btn';
    
    // Add all controls
    controls.appendChild(playBtn);
    controls.appendChild(speedSelector);
    if (bgColorInput) controls.appendChild(bgColorInput);
    controls.appendChild(closeBtn);
    
    // Append everything to modal
    modalContent.appendChild(player);
    modalContent.appendChild(controls);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Playback logic
    let currentFrameIndex = 0;
    let isPlaying = true;
    let playbackSpeed = 1;
    let playbackInterval;
    
    function updateFrame() {
      playerImg.src = dance.frames[currentFrameIndex];
    }
    
    function startPlayback() {
      clearInterval(playbackInterval);
      playbackInterval = setInterval(() => {
        currentFrameIndex = (currentFrameIndex + 1) % dance.frames.length;
        updateFrame();
      }, 1000 / (12 * playbackSpeed)); // Assume 12fps base playback
    }
    
    function togglePlayback() {
      isPlaying = !isPlaying;
      playBtn.textContent = isPlaying ? 'Pause' : 'Play';
      
      if (isPlaying) {
        startPlayback();
      } else {
        clearInterval(playbackInterval);
      }
    }
    
    // Start playback immediately
    startPlayback();
    
    // Event listeners
    playBtn.addEventListener('click', togglePlayback);
    
    speedSelector.addEventListener('change', () => {
      playbackSpeed = parseFloat(speedSelector.value);
      if (isPlaying) {
        startPlayback();
      }
    });
    
    closeBtn.addEventListener('click', () => {
      clearInterval(playbackInterval);
      modal.remove();
    });
    
    // Add CSS for modal
    const modalStyle = document.createElement('style');
    modalStyle.textContent = `
      .playback-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      
      .playback-content {
        background: white;
        padding: 20px;
        border-radius: 10px;
        max-width: 80%;
        max-height: 90%;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      
      .modal-player {
        width: 640px;
        height: 480px;
        max-width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #f5f5f5;
        overflow: hidden;
      }
      
      .modal-player img {
        max-width: 100%;
        max-height: 100%;
      }
      
      .modal-controls {
        margin-top: 15px;
        display: flex;
        gap: 10px;
      }
      
      .modal-controls button, .modal-controls select {
        padding: 8px 15px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      }
      
      .modal-play-btn {
        background: #4CAF50;
        color: white;
      }
      
      .modal-close-btn {
        background: #f44336;
        color: white;
      }
      
      .bg-color-input {
        width: 40px;
        height: 40px;
        padding: 0;
        border: 2px solid #ddd;
        border-radius: 50%;
        overflow: hidden;
      }
    `;
    document.head.appendChild(modalStyle);
  }
  
  // Add CSS styles for modal and gallery elements
  const style = document.createElement('style');
  style.textContent = `
    .playback-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    
    .playback-content {
      position: relative;
      background: #f5f5f5;
      padding: 20px;
      border-radius: 10px;
      max-width: 90%;
      max-height: 90%;
    }
    
    .close-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      font-size: 24px;
      border: none;
      background: transparent;
      cursor: pointer;
    }
    
    .gallery-play-btn {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 5px 15px;
      border-radius: 4px;
      margin-top: 8px;
      cursor: pointer;
      flex: 1;
    }
    
    .gallery-delete-btn {
      background: #f44336;
      color: white;
      border: none;
      padding: 5px 15px;
      border-radius: 4px;
      margin-top: 8px;
      cursor: pointer;
      flex: 1;
      margin-left: 5px;
    }
    
    .gallery-buttons {
      display: flex;
      width: 100%;
    }
    
    .filter-controls {
      display: flex;
      margin-bottom: 15px;
      gap: 10px;
    }
    
    .filter-btn {
      padding: 8px 15px;
      background: #ddd;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .filter-btn.active {
      background: #4CAF50;
      color: white;
      }
      
    .gallery-items {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }
    
    .gallery-thumbnail.animated {
      position: relative;
      overflow: hidden;
      background-color: transparent;
    }
    
    .gallery-thumbnail {
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
      background-color: white;
    }
    
    .type-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 12px;
      color: white;
      margin-bottom: 5px;
    }
    
    .type-badge.silhouette {
      background: #4CAF50;
    }
    
    .type-badge.original {
      background: #2196F3;
    }
    
    .playback-controls {
      margin-top: 15px;
      padding: 10px;
      background: #eee;
      border-radius: 5px;
    }
    
    .speed-slider {
      width: 150px;
      vertical-align: middle;
    }
    
    .background-control {
      margin-top: 10px;
    }
    
    .bg-select {
      padding: 5px;
      border-radius: 4px;
      margin-left: 5px;
    }
    
    .playback-canvas {
      border: 1px solid #ddd;
      background-color: white;
      /* Checkerboard pattern for transparency */
      background-image: linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
                        linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
                        linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
                        linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    }
  `;
  document.head.appendChild(style);
  });

  // In gallery.js - Load from localStorage
function loadDances() {
    return JSON.parse(localStorage.getItem('dances')) || [];
  }