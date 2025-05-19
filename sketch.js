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

// DOM Elements
let recordBtn;
let statusEl;
let trimUI;
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
  // Preload the model
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

// Main draw loop
function draw() {
  background(0);
  
  if (video && video.loadedmetadata) {
    if (isRecording) {
      // Recording mode - just show the video, no segmentation during recording
      image(video, 0, 0, width, height);
      
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
      // Trim mode - show original video frames for trimming
      if (recordedFrames[currentFrameIndex]) {
        image(recordedFrames[currentFrameIndex], 0, 0, width, height);
        
        // Add indicator text
        fill(255);
        textSize(16);
        text("Trim your video - segmentation will be applied after saving", 10, 20);
        
        // Draw trim indicators
        drawTrimIndicators();
      }
    } else {
      // Live preview mode - just show the video
      image(video, 0, 0, width, height);
      
      // Add debug indicators
      fill(255);
      textSize(16);
      text("Press record to capture", 10, 20);
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
  isRecording = true;
  recordingStartTime = millis();
  recordBtn.disabled = true;
  updateStatus("Recording...", "recording");
}

function captureFrame() {
  // Just capture the raw video frame
  let frame = createImage(video.width, video.height);
  frame.copy(video, 0, 0, video.width, video.height, 0, 0, video.width, video.height);
  recordedFrames.push(frame);
  console.log("Captured raw video frame");
}

async function endRecording() {
  isRecording = false;
  isProcessing = false;
  updateStatus("Ready to trim your video", "ready");
  
  if (recordedFrames.length > 0) {
    setupTrimUI();
  } else {
    updateStatus("No frames were captured. Try again.", "error");
    recordBtn.disabled = false;
  }
}

function setupTrimUI() {
  trimStart.max = recordedFrames.length - 1;
  trimEnd.max = recordedFrames.length - 1;
  trimEnd.value = recordedFrames.length - 1;
  currentFrameIndex = 0;
  updateTrimUI();
  updateFrameCounter();
  trimUI.classList.remove('hidden');
  
  updateStatus("Ready to trim! Use controls below", "ready");
  recordBtn.disabled = false;
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
  cancelBtn.disabled = true;
  updateStatus("Creating silhouettes...", "processing");
  
  try {
    // Determine how many frames to keep to avoid storage issues
    const selectedFrames = end - start + 1;
    const MAX_FRAMES = 24; // Limit to 24 frames maximum
    
    // If too many frames selected, subsample them
    let framesToKeep = selectedFrames;
    let frameStep = 1;
    
    if (selectedFrames > MAX_FRAMES) {
      framesToKeep = MAX_FRAMES;
      frameStep = Math.floor(selectedFrames / MAX_FRAMES);
      updateStatus(`Optimizing: Using ${framesToKeep} frames to stay within storage limits`, "processing");
    }
    
    isProcessing = true;
    
    // Create final silhouette frames by applying segmentation to each selected frame
    currentSilhouette = [];
    segmentationMasks = [];
    
    // Process each frame from the selected range
    let processedCount = 0;
    
    for (let i = start; i <= end; i += frameStep) {
      if (processedCount >= MAX_FRAMES) break;
      
      processingProgress = Math.floor((processedCount / Math.min(framesToKeep, MAX_FRAMES)) * 100);
      updateStatus(`Processing frame ${processedCount + 1}/${Math.min(framesToKeep, MAX_FRAMES)}...`, "processing");
      
      // Get the frame at this index
      const frame = recordedFrames[i];
      
      // Apply segmentation model to the frame
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI to update
      
      // Process the frame with the segmentation model
      const segmentationResult = await bodySegmentation.detect(frame.canvas);
      
      // Create a mask from the segmentation result
      const mask = createImage(frame.width, frame.height);
      mask.loadPixels();
      
      // Get mask data
      if (segmentationResult && segmentationResult.mask) {
        // Use the mask from the segmentation result
        mask.copy(segmentationResult.mask, 0, 0, frame.width, frame.height, 0, 0, frame.width, frame.height);
      } else {
        console.error("No segmentation mask available");
        throw new Error("Segmentation failed");
      }
      
      // Store segmentation results
      segmentationMasks.push({
        original: frame,
        mask: mask
      });
      
      // Create silhouette frame with transparency
      const silhouetteFrame = createImage(frame.width, frame.height);
      silhouetteFrame.loadPixels();
      
      // Copy the original frame pixels
      silhouetteFrame.copy(frame, 0, 0, frame.width, frame.height, 0, 0, frame.width, frame.height);
      
      // Apply mask with transparency
      silhouetteFrame.loadPixels();
      mask.loadPixels();
      
      // Create an inverted mask where person is opaque and background is transparent
      for (let p = 0; p < silhouetteFrame.pixels.length; p += 4) {
        // If mask pixel is transparent or white, make the output pixel transparent
        if (mask.pixels[p+3] === 0 || (mask.pixels[p] > 200 && mask.pixels[p+1] > 200 && mask.pixels[p+2] > 200)) {
          silhouetteFrame.pixels[p + 3] = 0; // Set alpha to 0 (transparent)
        } else {
          // For the person area, make a solid black silhouette
          silhouetteFrame.pixels[p] = 0; // R
          silhouetteFrame.pixels[p + 1] = 0; // G
          silhouetteFrame.pixels[p + 2] = 0; // B
          silhouetteFrame.pixels[p + 3] = 255; // Alpha
        }
      }
      silhouetteFrame.updatePixels();
      
      // Add silhouette to the array
      currentSilhouette.push(silhouetteFrame);
      
      processedCount++;
    }
    
    // Save silhouette to gallery
    updateStatus("Saving silhouette...", "processing");
    await saveToGallery();
    
    // Reset UI
    isProcessing = false;
    trimUI.classList.add('hidden');
    updateStatus("Saved! Check your gallery", "success");
    
    // Re-enable controls
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    recordBtn.disabled = false;
    
  } catch (error) {
    console.error("Error processing silhouette:", error);
    isProcessing = false;
    updateStatus("Error: " + error.message, "error");
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    recordBtn.disabled = false;
  }
}

async function saveToGallery() {
  // Generate a unique ID for this silhouette
  const id = Date.now();
  
  // Create silhouette object
  const dance = {
    id: id,
    type: "silhouette",
    hasTransparency: true,
    frames: currentSilhouette.map(f => {
      // Use lower quality for PNG to save space
      return f.canvas.toDataURL('image/png', 0.7);
    }),
    timestamp: new Date().toISOString()
  };
  
  // Optional: Calculate the total size of the data
  const totalSize = JSON.stringify(dance).length;
  console.log(`Silhouette data size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  
  // Download the silhouette frames first
  try {
    // Trigger immediate download
    await downloadSilhouette(dance);
    console.log("Silhouette downloaded successfully");
  } catch (error) {
    console.error("Error downloading silhouette:", error);
  }
  
  // Try to save to localStorage (if there's space)
  try {
    // First try to save just the silhouette (most important)
    const savedSilhouette = await new Promise(resolve => {
      if (window.saveToLocalStorage) {
        const result = window.saveToLocalStorage(dance);
        resolve(result);
      } else {
        // Fallback to direct localStorage
        try {
          const dances = JSON.parse(localStorage.getItem('dances') || '[]');
          
          // Clean up storage if needed
          if (JSON.stringify(dances).length > 2000000) { // 2MB limit
            // Remove the oldest dances to make space
            const sortedDances = [...dances].sort((a, b) => a.id - b.id);
            while (sortedDances.length > 0 && JSON.stringify(sortedDances).length > 1000000) {
              sortedDances.shift(); // Remove oldest
            }
            localStorage.setItem('dances', JSON.stringify(sortedDances));
            console.log("Storage cleaned up to prevent quota issues");
          }
          
          dances.push(dance);
          localStorage.setItem('dances', JSON.stringify(dances));
          resolve(dance);
        } catch (error) {
          console.error("Error saving silhouette:", error);
          resolve(null);
        }
      }
    });
    
    // If silhouette saved successfully to localStorage, try to save original too
    if (savedSilhouette) {
      console.log(`Saved transparent silhouette with ${dance.frames.length} frames to localStorage`);
      
      // Now try to save the original video too if there's space
      try {
        const originalVideo = {
          id: id,
          type: "original",
          hasTransparency: false,
          frames: segmentationMasks.slice(
            parseInt(trimStart.value), 
            parseInt(trimEnd.value) + 1
          ).filter((_, i) => i % (Math.floor(segmentationMasks.length / currentSilhouette.length) || 1) === 0) // Match frame count
            .map(frame => {
              // Create a smaller version to save space
              const MAX_DIM = 320;
              let smallOriginal = createImage(MAX_DIM, Math.floor(MAX_DIM * (frame.original.height / frame.original.width)));
              smallOriginal.copy(frame.original, 0, 0, frame.original.width, frame.original.height, 
                              0, 0, smallOriginal.width, smallOriginal.height);
              return smallOriginal.canvas.toDataURL('image/webp', 0.6); // Much lower quality for originals
            }),
          timestamp: new Date().toISOString()
        };
        
        if (window.saveToLocalStorage) {
          const originalSaved = window.saveToLocalStorage(originalVideo);
          if (originalSaved) {
            console.log(`Saved original video with ${originalVideo.frames.length} frames`);
          } else {
            console.log("Could not save original video, but silhouette was saved");
          }
        }
      } catch (error) {
        console.error("Error saving original video:", error);
        console.log("Only silhouette was saved");
      }
    }
  } catch (error) {
    console.error("Error saving to localStorage:", error);
    // Still consider this a success if we downloaded the frames
  }
  
  // Show the gallery link regardless of localStorage success
  // as we've downloaded the files directly
  setupGalleryLink();
}

// Function to upload silhouette frames to GitHub
async function downloadSilhouette(dance) {
  // GitHub settings - REPLACE THESE WITH YOUR OWN VALUES
  const GITHUB_TOKEN = ""; // ADD YOUR TOKEN HERE
  const GITHUB_USERNAME = ""; // ADD YOUR USERNAME HERE
  const GITHUB_REPO = ""; // ADD YOUR REPOSITORY NAME HERE
  const GITHUB_BRANCH = "main";
  
  if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) {
    alert("GitHub credentials not set. Please update the GITHUB_TOKEN, GITHUB_USERNAME, and GITHUB_REPO in the code.");
    return false;
  }
  
  // Create folder name with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folderName = `silhouettes/${timestamp}`;
  
  try {
    // Status update
    updateStatus("Uploading silhouette to GitHub...", "processing");
    
    // Upload each frame
    for (let i = 0; i < dance.frames.length; i++) {
      const frameNumber = i.toString().padStart(3, '0');
      const filename = `${folderName}/frame-${frameNumber}.png`;
      
      // Convert base64 data URL to content for GitHub
      const content = dance.frames[i].split(',')[1]; // Remove the "data:image/png;base64," part
      
      // GitHub API requires file content to be base64 encoded
      await uploadToGitHub(
        GITHUB_USERNAME,
        GITHUB_REPO,
        GITHUB_BRANCH,
        filename,
        content,
        `Add silhouette frame ${frameNumber}`,
        GITHUB_TOKEN
      );
      
      // Update progress
      processingProgress = Math.floor((i / dance.frames.length) * 100);
      updateStatus(`Uploading frame ${i+1}/${dance.frames.length} to GitHub...`, "processing");
    }
    
    // Create a README file with metadata
    const readmeContent = btoa(`# Dance Silhouette
Generated: ${new Date().toLocaleString()}
Frames: ${dance.frames.length}
Type: Silhouette with transparency
    
This silhouette was created with Dance Silhouette Booth.
    
View the frames in this folder to see the full animation.`);
    
    await uploadToGitHub(
      GITHUB_USERNAME,
      GITHUB_REPO,
      GITHUB_BRANCH,
      `${folderName}/README.md`,
      readmeContent,
      "Add silhouette metadata",
      GITHUB_TOKEN
    );
    
    // Success message with link to repository
    const repoUrl = `https://github.com/${GITHUB_USERNAME}/${GITHUB_REPO}/tree/${GITHUB_BRANCH}/${folderName}`;
    
    // Create the "view on GitHub" link
    const viewOnGitHub = document.createElement('div');
    viewOnGitHub.innerHTML = `<a href="${repoUrl}" target="_blank" style="display: inline-block; margin-top: 10px; padding: 8px 15px; background: #24292e; color: white; text-decoration: none; font-weight: bold; border-radius: 5px;">View on GitHub</a>`;
    galleryLink.appendChild(viewOnGitHub);
    
    updateStatus("Silhouette saved to GitHub!", "success");
    return true;
  } catch (error) {
    console.error("Error uploading to GitHub:", error);
    alert(`Failed to upload to GitHub: ${error.message}`);
    return false;
  }
}

// Helper function to upload a file to GitHub repository
async function uploadToGitHub(username, repo, branch, path, content, commitMessage, token) {
  // GitHub API endpoint for creating/updating a file
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
  
  try {
    // First check if the file already exists
    let sha = null;
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (response.status === 200) {
        const data = await response.json();
        sha = data.sha;
      }
    } catch (error) {
      // File doesn't exist, which is fine
      console.log("File doesn't exist yet, creating new file");
    }
    
    // Create or update the file
    const requestBody = {
      message: commitMessage,
      content: content,
      branch: branch
    };
    
    // Include sha if the file already exists
    if (sha) {
      requestBody.sha = sha;
    }
    
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error in uploadToGitHub:", error);
    throw error;
  }
}

function cancelProcessing() {
  recordedFrames = [];
  segmentationMasks = [];
  trimUI.classList.add('hidden');
  updateStatus("Recording canceled", "warning");
  recordBtn.disabled = false;
}

// Connect View Gallery link
function setupGalleryLink() {
  const galleryLink = document.getElementById('gallery-link');
  if (galleryLink) {
    galleryLink.classList.remove('hidden');
  }
}

// Helpers
function updateStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type;
}

function updateTrimUI() {
  startFrameEl.textContent = trimStart.value;
  endFrameEl.textContent = trimEnd.value;
  currentFrameIndex = parseInt(trimStart.value);
  updateFrameCounter();
}

function updateFrameCounter() {
  frameCounter.textContent = `Frame: ${currentFrameIndex + 1}/${segmentationMasks.length}`;
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
    // Insert at the beginning of the trim UI
    trimUI.insertBefore(controlsContainer, trimUI.firstChild.nextSibling);
    
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