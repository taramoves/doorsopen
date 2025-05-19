// State
let video;
let bodySegmentation;
let recordedFrames = [];
let segmentationMasks = [];
let currentSilhouette = [];
let isRecording = false;
let isProcessing = false;
let recordingStartTime = 0;
const TARGET_FPS = 12;
const RECORD_SECONDS = 5;
let isPlaying = false;
let showSegmentation = true;
let currentFrameIndex = 0;
let playbackInterval;
let isModelReady = false;
let liveSegmentation;
let processingProgress = 0;
let useSimplifiedSegmentation = true; // Toggle this for simpler but more reliable segmentation

// DOM Elements
let recordBtn;
let statusEl;
let trimUI;
let framePreview;
let startFrameEl;
let endFrameEl;
let trimStart;
let trimEnd;
let confirmBtn;
let cancelBtn;
let galleryLink;
let playBtn;
let prevFrameBtn;
let nextFrameBtn;
let toggleSegBtn;
let setStartBtn;
let setEndBtn;
let frameCounter;

// Initialize
function preload() {
  // Preload the model using the approach from the example
  bodySegmentation = ml5.bodySegmentation("SelfieSegmentation", {
    maskType: "person"
  });
}

function setup() {
  createCanvas(640, 480).parent('camera-view');
  
  // Get DOM elements
  recordBtn = document.getElementById('record-btn');
  statusEl = document.getElementById('status');
  trimUI = document.getElementById('trim-ui');
  framePreview = document.getElementById('frame-preview');
  startFrameEl = document.getElementById('start-frame');
  endFrameEl = document.getElementById('end-frame');
  trimStart = document.getElementById('trim-start');
  trimEnd = document.getElementById('trim-end');
  confirmBtn = document.getElementById('confirm-btn');
  cancelBtn = document.getElementById('cancel-btn');
  galleryLink = document.getElementById('gallery-link');
  
  // Create playback controls if they don't exist
  setupPlaybackControls();
  
  // Camera setup
  video = createCapture(VIDEO, () => {
    video.size(width, height);
    video.hide();
    
    // Start continuous detection on the video
    bodySegmentation.detectStart(video, gotSegmentation);
    
    updateStatus("Ready to record!");
    if (recordBtn) recordBtn.disabled = false;
  });
  
  if (video.elt) {
    video.elt.addEventListener('error', () => {
      updateStatus("Camera error. Please refresh and allow access.", "error");
    });
  }
  
  // Add event listeners to controls that exist
  if (recordBtn) recordBtn.addEventListener('click', startRecording);
  if (confirmBtn) confirmBtn.addEventListener('click', confirmSilhouette);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelProcessing);
  if (trimStart) trimStart.addEventListener('input', updateTrimUI);
  if (trimEnd) trimEnd.addEventListener('input', updateTrimUI);
}

function gotSegmentation(result) {
  liveSegmentation = result;
}

function setupPlaybackControls() {
  // Create container if it doesn't exist
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'playback-controls';
  controlsContainer.innerHTML = `
    <div class="controls-row">
      <button id="play-btn">Play</button>
      <button id="prev-frame-btn">◀</button>
      <button id="next-frame-btn">▶</button>
    </div>
    <div class="controls-row">
      <button id="toggle-seg-btn" class="toggle-button">Show Original</button>
      <button id="set-start-btn">Set Start</button>
      <button id="set-end-btn">Set End</button>
    </div>
    <span id="frame-counter">Frame: 0/0</span>
  `;
  
  if (trimUI) {
    trimUI.insertBefore(controlsContainer, framePreview);
    
    // Now get the references
    playBtn = document.getElementById('play-btn');
    prevFrameBtn = document.getElementById('prev-frame-btn');
    nextFrameBtn = document.getElementById('next-frame-btn');
    toggleSegBtn = document.getElementById('toggle-seg-btn');
    setStartBtn = document.getElementById('set-start-btn');
    setEndBtn = document.getElementById('set-end-btn');
    frameCounter = document.getElementById('frame-counter');
    
    // Add event listeners
    if (playBtn) playBtn.addEventListener('click', togglePlayback);
    if (prevFrameBtn) prevFrameBtn.addEventListener('click', () => navigateFrame(-1));
    if (nextFrameBtn) nextFrameBtn.addEventListener('click', () => navigateFrame(1));
    if (toggleSegBtn) toggleSegBtn.addEventListener('click', toggleSegmentation);
    if (setStartBtn) setStartBtn.addEventListener('click', setStartFrame);
    if (setEndBtn) setEndBtn.addEventListener('click', setEndFrame);
  }
}

function initModel() {
  try {
    const options = {
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2
    };
    
    console.log("Initializing BodyPix with options:", options);
    
    // Use the bodySegmentation method in the latest ml5.js
    bodySegmentation = ml5.bodySegmentation('BodyPix', options, modelReady);
  } catch (error) {
    console.error("Error initializing model:", error);
    updateStatus("Could not initialize model. Check console.", "error");
  }
}

function modelReady() {
  console.log("BodyPix model loaded successfully!");
  console.log("Model methods:", Object.getOwnPropertyNames(bodySegmentation));
  isModelReady = true;
  updateStatus("Ready to record!");
  if (recordBtn) recordBtn.disabled = false;
}

// Main draw loop
function draw() {
  background(0);
  
  if (video && video.loadedmetadata) {
    if (isRecording) {
      // Recording mode - show the green screen effect
      background(0, 255, 0); // Green background
      
      if (liveSegmentation && liveSegmentation.mask) {
        // Show segmented video during recording
        let tempVideo = createImage(video.width, video.height);
        tempVideo.copy(video, 0, 0, video.width, video.height, 0, 0, video.width, video.height);
        tempVideo.mask(liveSegmentation.mask);
        image(tempVideo, 0, 0, width, height);
      } else {
        image(video, 0, 0, width, height);
      }
      
      // Display timer
      const elapsed = millis() - recordingStartTime;
      const remaining = max(0, RECORD_SECONDS * 1000 - elapsed);
      fill(255, 0, 0);
      textSize(32);
      text((remaining/1000).toFixed(1) + "s", 20, 40);
      
      // Capture frames at target framerate
      if (frameCount % floor(60/TARGET_FPS) === 0 && elapsed <= RECORD_SECONDS * 1000) {
        captureFrame();
      }
      
      // End recording
      if (elapsed >= RECORD_SECONDS * 1000) {
        endRecording();
      }
    } else if (isProcessing) {
      // Processing mode - show progress
      background(0);
      fill(255);
      textSize(24);
      text(`Processing: ${processingProgress}%`, width/2 - 100, height/2);
      
      // Draw progress bar
      const barWidth = width * 0.8;
      const barHeight = 20;
      const barX = width/2 - barWidth/2;
      const barY = height/2 + 30;
      
      // Background bar
      fill(50);
      rect(barX, barY, barWidth, barHeight);
      
      // Progress bar
      fill(0, 255, 0);
      rect(barX, barY, barWidth * (processingProgress/100), barHeight);
      
    } else if (trimUI && trimUI.classList.contains('hidden') === false) {
      // Trim mode with pre-processed segmentation
      if (segmentationMasks[currentFrameIndex]) {
        const { original, mask } = segmentationMasks[currentFrameIndex];
        
        if (showSegmentation) {
          // Show segmented version with green background
          background(0, 255, 0); // Green background
          
          // Create a copy of the original for display
          let maskedImg = createImage(original.width, original.height);
          maskedImg.copy(original, 0, 0, original.width, original.height, 
                        0, 0, original.width, original.height);
          
          // Apply the mask
          maskedImg.mask(mask);
          
          // Display the masked image over the green background
          image(maskedImg, 0, 0, width, height);
          
          // Add indicator text
          fill(255);
          textSize(16);
          text("Showing silhouette", 10, 20);
        } else {
          // Show original frame
          image(original, 0, 0, width, height);
          
          // Add indicator text
          fill(255);
          textSize(16);
          text("Showing original", 10, 20);
        }
        
        // Draw trim indicators
        drawTrimIndicators();
      }
    } else {
      // Live preview mode
      background(0, 255, 0); // Green background
      if (liveSegmentation) {
        // Show live segmentation
        let tempVideo = createImage(video.width, video.height);
        tempVideo.copy(video, 0, 0, video.width, video.height, 0, 0, video.width, video.height);
        tempVideo.mask(liveSegmentation.mask);
        image(tempVideo, 0, 0, width, height);
        
        // Debug info
        fill(255);
        textSize(16);
        text("Live segmentation active", 10, 20);
      } else {
        // Just show video
        image(video, 0, 0, width, height);
      }
    }
  }
}

function drawTrimIndicators() {
  noFill();
  if (currentFrameIndex === parseInt(trimStart.value)) {
    stroke(0, 255, 0);
    strokeWeight(4);
    rect(0, 0, width, height);
  }
  if (currentFrameIndex === parseInt(trimEnd.value)) {
    stroke(255, 0, 0);
    strokeWeight(4);
    rect(0, 0, width, height);
  }
}

// Recording functions
function startRecording() {
  recordedFrames = [];
  segmentationMasks = [];
  isRecording = true;
  recordingStartTime = millis();
  recordBtn.disabled = true;
  updateStatus("Recording...", "recording");
}

function captureFrame() {
  // Capture both the frame and the current segmentation
  let frame = createImage(video.width, video.height);
  frame.copy(video, 0, 0, video.width, video.height, 0, 0, video.width, video.height);
  
  if (liveSegmentation && liveSegmentation.mask) {
    // If we have a live segmentation mask, use it
    let maskCopy = createImage(liveSegmentation.mask.width, liveSegmentation.mask.height);
    maskCopy.copy(liveSegmentation.mask, 0, 0, liveSegmentation.mask.width, liveSegmentation.mask.height, 
                 0, 0, maskCopy.width, maskCopy.height);
    
    segmentationMasks.push({
      original: frame,
      mask: maskCopy
    });
    
    console.log("Captured frame with live segmentation mask");
  } else {
    // Store just the original frame, we'll process it later
    recordedFrames.push(frame);
    console.log("Captured frame without segmentation");
  }
}

async function endRecording() {
  isRecording = false;
  isProcessing = true;
  processingProgress = 0;
  updateStatus("Finalizing frames...", "processing");
  
  // If we have frames without masks, use simplified approach
  if (recordedFrames.length > 0) {
    await processSimplifiedSegmentation();
  }
  
  isProcessing = false;
  if (segmentationMasks.length > 0) {
    setupTrimUI();
  } else {
    updateStatus("No frames could be processed. Try again.", "error");
    recordBtn.disabled = false;
  }
}

// Simplified segmentation that creates manual silhouettes
async function processSimplifiedSegmentation() {
  for (let i = 0; i < recordedFrames.length; i++) {
    processingProgress = Math.floor((i / recordedFrames.length) * 100);
    updateStatus(`Creating silhouette ${i + 1}/${recordedFrames.length}...`, "processing");
    
    // Create a simplified green screen effect manually
    const img = recordedFrames[i];
    
    // Create a new canvas to draw with blend modes
    let maskCanvas = createGraphics(img.width, img.height);
    maskCanvas.background(0);
    
    // Draw a darker version of the image 
    maskCanvas.tint(255, 100);
    maskCanvas.image(img, 0, 0);
    
    // Threshold to create a simple mask
    maskCanvas.filter(THRESHOLD, 0.5);
    
    // Create a mask image
    let maskImg = createImage(img.width, img.height);
    maskImg.copy(maskCanvas, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
    
    segmentationMasks.push({
      original: img,
      mask: maskImg
    });
    
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  // Clear recordedFrames to save memory
  recordedFrames = [];
}

function setupTrimUI() {
  trimStart.max = segmentationMasks.length - 1;
  trimEnd.max = segmentationMasks.length - 1;
  trimEnd.value = segmentationMasks.length - 1;
  currentFrameIndex = 0;
  updateTrimUI();
  updateFrameCounter();
  trimUI.classList.remove('hidden');
  
  // Set initial state of toggle button
  if (toggleSegBtn) {
    toggleSegBtn.textContent = showSegmentation ? 'Show Original' : 'Show Silhouette';
    toggleSegBtn.classList.toggle('active-toggle', showSegmentation);
  }
  
  updateStatus("Ready to trim! Use controls below", "ready");
}

// Trim UI functions
function updateTrimUI() {
  const start = parseInt(trimStart.value);
  const end = parseInt(trimEnd.value);
  
  startFrameEl.textContent = start;
  endFrameEl.textContent = end;
  currentFrameIndex = constrain(currentFrameIndex, start, end);
  updateFramePreview();
  updateFrameCounter();
}

function updateFramePreview() {
  if (segmentationMasks[currentFrameIndex]) {
    const { original } = segmentationMasks[currentFrameIndex];
    framePreview.innerHTML = '';
    const img = document.createElement('img');
    img.src = original.canvas.toDataURL();
    img.style.width = '100%';
    framePreview.appendChild(img);
  }
}

function updateFrameCounter() {
  frameCounter.textContent = `Frame: ${currentFrameIndex + 1}/${segmentationMasks.length}`;
}

// Playback controls
function togglePlayback() {
  isPlaying = !isPlaying;
  playBtn.textContent = isPlaying ? 'Pause' : 'Play';
  
  if (isPlaying) {
    playbackInterval = setInterval(() => {
      const start = parseInt(trimStart.value);
      const end = parseInt(trimEnd.value);
      currentFrameIndex = (currentFrameIndex + 1) % (end + 1);
      if (currentFrameIndex < start) currentFrameIndex = start;
      updateFrameCounter();
    }, 1000 / TARGET_FPS);
  } else {
    clearInterval(playbackInterval);
  }
}

function navigateFrame(direction) {
  const start = parseInt(trimStart.value);
  const end = parseInt(trimEnd.value);
  currentFrameIndex = constrain(currentFrameIndex + direction, start, end);
  updateFrameCounter();
}

function toggleSegmentation() {
  showSegmentation = !showSegmentation;
  
  // Update button text and style
  if (toggleSegBtn) {
    toggleSegBtn.textContent = showSegmentation ? 'Show Original' : 'Show Silhouette';
    toggleSegBtn.classList.toggle('active-toggle', showSegmentation);
  }
}

function setStartFrame() {
  trimStart.value = currentFrameIndex;
  updateTrimUI();
}

function setEndFrame() {
  trimEnd.value = currentFrameIndex;
  updateTrimUI();
}

// Final processing
async function confirmSilhouette() {
  const start = parseInt(trimStart.value);
  const end = parseInt(trimEnd.value);
  
  if (start >= end) {
    updateStatus("Invalid range", "error");
    return;
  }
  
  confirmBtn.disabled = true;
  updateStatus("Creating final silhouette...", "processing");
  
  // Create final silhouette frames
  currentSilhouette = [];
  for (let i = start; i <= end; i++) {
    const { original, mask } = segmentationMasks[i];
    
    // Create a new image to hold the silhouette with green background 
    let silhouette = createImage(original.width, original.height);
    silhouette.loadPixels();
    
    // Fill with solid green
    for (let j = 0; j < silhouette.pixels.length; j += 4) {
      silhouette.pixels[j] = 0;        // R
      silhouette.pixels[j + 1] = 255;  // G
      silhouette.pixels[j + 2] = 0;    // B
      silhouette.pixels[j + 3] = 255;  // A
    }
    silhouette.updatePixels();
    
    // Create a copy of the original
    let maskedImg = createImage(original.width, original.height);
    maskedImg.copy(original, 0, 0, original.width, original.height, 
                  0, 0, original.width, original.height);
    maskedImg.mask(mask);
    
    // Apply the masked person onto the green background
    silhouette.blend(maskedImg, 0, 0, maskedImg.width, maskedImg.height, 
                     0, 0, silhouette.width, silhouette.height, ADD);
    
    currentSilhouette.push(silhouette);
    
    if (i % 5 === 0 || i === end) {
      updateStatus(`Processing frame ${i - start + 1}/${end - start + 1}`, "processing");
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  saveToGallery();
  
  updateStatus("Silhouette saved to gallery!", "success");
  trimUI.classList.add('hidden');
  galleryLink.classList.remove('hidden');
  confirmBtn.disabled = false;
}

function saveToGallery() {
  const dance = {
    id: Date.now(),
    frames: currentSilhouette.map(f => f.canvas.toDataURL('image/webp', 0.8)),
    speedX: random(-2, 2),
    speedY: random(-2, 2),
    scale: random(0.5, 1.5),
    timestamp: new Date().toISOString()
  };
  
  const dances = JSON.parse(localStorage.getItem('dances') || '[]');
  dances.push(dance);
  localStorage.setItem('dances', JSON.stringify(dances));
  
  // For GitHub commit preparation
  prepareForCommit(dance);
}

function prepareForCommit(dance) {
  console.log("Dance data ready for commit:");
  console.log(JSON.stringify(dance, null, 2));
  console.log("To save to GitHub:");
  console.log(`1. Create folder: assets/dances/${dance.id}/`);
  console.log(`2. Save ${dance.frames.length} frames as frame_0000.webp, etc.`);
  console.log(`3. Save meta.json with the dance object`);
}

function cancelProcessing() {
  recordedFrames = [];
  segmentationMasks = [];
  trimUI.classList.add('hidden');
  updateStatus("Recording canceled", "warning");
  recordBtn.disabled = false;
}

// Helpers
function updateStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type;
}