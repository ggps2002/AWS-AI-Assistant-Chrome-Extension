let clickableElements = [];
let currentStepIndex = 0; // Default to 0

function traverseShadowDOM(node, callback) {
    if (node.shadowRoot) {
        node.shadowRoot.childNodes.forEach((child) => traverseShadowDOM(child, callback));
    }
    callback(node);
}

// Function to check if an element's innerHTML contains any clickable element
function containsClickableElement(element) {
    return clickableElements.some((clickable) =>
        element.innerHTML === clickable || element.title.includes(clickable)
    );
}

function removeHighlights() {
    document.querySelectorAll("button, span, h4").forEach((element) => {
        traverseShadowDOM(element, (node) => {
            if (containsClickableElement(node) && node.style.border === "2px solid red") {
                node.style.removeProperty("border");
            }
        });
    });
}


// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (clickableElements.length > 0) return;
    if (changes.stepInstructions) {
        const stepInstructions = changes.stepInstructions.newValue;
        console.log("Updated instructions received:", stepInstructions);
        updateUI(stepInstructions);
    }
    if (changes.stepInstructions) {
        console.log("stepInstructions updated, refreshing content...");
        loadInstructions(); // ✅ Update content immediately when storage changes
    }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateInstructions") {
        removeHighlights();
        const stepInstructions = message.stepInstructions;
        console.log("Instructions received via message:", stepInstructions);
        chrome.storage.local.set({ "stepInstructions": stepInstructions }, () => {
            console.log("Instructions saved to storage.");
        });
    }
});

// Initial load
chrome.storage.local.get(["clickableElements", "stepInstructions"], (data) => {
    if (data.clickableElements) {
        clickableElements = data.clickableElements;
        console.log("Initial clickableElements loaded:", clickableElements);
        highlightButtonsAndSpans();
    }

    // if (data.stepInstructions) {
    //     stepsInstructions = data.stepInstructions;
    //     console.log("Loaded stepInstructions:", stepsInstructions);

    //     if (stepsInstructions.Instructions && Array.isArray(stepsInstructions.Instructions) && stepsInstructions.Instructions.length > 0) {
    //         stepsDiv.innerHTML = stepsInstructions.Instructions[0].content;
    //     } else {
    //         console.log("Instructions array is missing or empty.");
    //         stepsDiv.innerHTML = "<p>No instructions available</p>";
    //     }
    // } else {
    //     console.log("No stepInstructions found in storage.");
    //     stepsDiv.innerHTML = "<p>No instructions available</p>";
    // }

});

// Function to check if an element's innerHTML contains any clickable element
function containsClickableElement(element) {
    return clickableElements.find((clickable) =>
        element.innerHTML.trim() === clickable || element.title.includes(clickable)
    );
}

function removeHighlightsOnClick(element, clickable) {
    element.style.removeProperty("border");
    console.log("Border removed from clicked element");

    // Remove from memory first
    clickableElements = clickableElements.filter(
        (click) => click !== clickable
    );

    console.log("Updated clickableElements:", clickableElements);

    // Update UI immediately
    highlightButtonsAndSpans();

    // Save updated list back to storage
    chrome.storage.local.set({ "clickableElements": clickableElements }, () => {
        console.log("Updated clickableElements saved to storage.");
    });

}

// function highlightShadowElements() {
//     traverseShadowDOM(document.body, (element) => {
//         const clickable = containsClickableElement(element);
//         if (clickable) {
//             element.style.setProperty("border", "2px solid red", "important");
//             console.log("Shadow DOM Border added to:", clickable, element);
//             element.addEventListener("click", () => removeHighlightsOnClick(element, clickable));
//         }
//     });
// }

function highlightButtonsAndSpans() {
    document.querySelectorAll("button, span, h4").forEach((element) => {
        if (containsClickableElement(element)) {
            element.style.setProperty("border", "2px solid red", "important");
            const clickable = containsClickableElement(element);
            console.log("Border added to element:", clickable);
            element.addEventListener("click", () => removeHighlightsOnClick(element, clickable));
        }
    });
}

function updateUI(stepInstructions) {
    console.log("Updating UI with instructions:", stepInstructions);

    const regex = /\((.*?)\)/g;

    stepInstructions.Instructions.forEach((instruction) => {
        const content = instruction.content;
        let match;
        while ((match = regex.exec(content)) !== null) {
            clickableElements.push(match[1]);
        }
    });

    clickableElements = [...new Set(clickableElements)]; // Remove duplicates
    console.log("Updated clickable elements:", clickableElements);

    chrome.storage.local.set({ "clickableElements": clickableElements }, () => {
        console.log("clickableElements saved to storage.");
        highlightButtonsAndSpans(); // Ensure UI updates after storage update
    });
    // MutationObserver to reapply styles dynamically
    const observer = new MutationObserver((mutationsList) => {
        let shouldHighlight = false;
    
        mutationsList.forEach((mutation) => {
            if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                shouldHighlight = true;
            }
        });
    
        if (shouldHighlight) {
            highlightButtonsAndSpans();
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    

    // Initial run to highlight existing elements
    highlightButtonsAndSpans();
}




const persistentPopupdiv = document.createElement('div');
persistentPopupdiv.id = 'persistent-popup';
persistentPopupdiv.style.position = 'fixed';
persistentPopupdiv.style.bottom = '60px';
persistentPopupdiv.style.width = '25px';
persistentPopupdiv.style.height = '25px';
persistentPopupdiv.style.right = '20px';
persistentPopupdiv.style.padding = '4px';
persistentPopupdiv.style.borderRadius = '50%';
persistentPopupdiv.style.backgroundColor = '#007bff';
persistentPopupdiv.style.cursor = 'pointer';

document.body.appendChild(persistentPopupdiv);

const stepsDiv = document.createElement('div');
stepsDiv.id = 'steps';
stepsDiv.style.position = 'fixed';
stepsDiv.style.bottom = '120px';
stepsDiv.style.right = '20px';
stepsDiv.style.padding = '8px';
stepsDiv.style.borderRadius = '5px';
stepsDiv.style.backgroundColor = '#fff';
stepsDiv.style.border = '1px solid #ccc';
stepsDiv.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
stepsDiv.style.zIndex = '1000';

// ✅ Separate div for dynamic content
const contentDiv = document.createElement('div');
contentDiv.id = 'steps-content';
contentDiv.innerHTML = "<p>Loading instructions...</p>"; // Default text

const navigationNextButton = document.createElement('button');
navigationNextButton.id = 'navigation-next';
navigationNextButton.innerHTML = `Next`;

const navigationPrevButton = document.createElement('button');
navigationPrevButton.id = 'navigation-previous';
navigationPrevButton.innerHTML = `Previous`;

const navDiv = document.createElement('div');
navDiv.style.display = 'flex';
navDiv.style.marginTop = '8px';
navDiv.style.justifyContent = 'space-around';
navDiv.appendChild(navigationPrevButton);
navDiv.appendChild(navigationNextButton);

stepsDiv.appendChild(contentDiv);
stepsDiv.appendChild(navDiv);
document.body.appendChild(stepsDiv);

// 🔹 Function to Load Instructions
function loadInstructions() {
    chrome.storage.local.get(["stepInstructions", "currentStepIndex"], (data) => {
        console.log("Retrieved data from storage:", data);

        if (data.currentStepIndex !== undefined) {
            currentStepIndex = data.currentStepIndex; // Restore last viewed step
        }

        if (data.stepInstructions) {
            let stepsInstructions = data.stepInstructions;

            if (stepsInstructions.Instructions && stepsInstructions.Instructions.length > 0) {
                contentDiv.innerHTML = stepsInstructions.Instructions[currentStepIndex]?.content || "<p>No instructions available</p>";
                navDiv.style.display = 'flex';
            } else {
                contentDiv.innerHTML = "<p>No instructions available</p>";
                navDiv.style.display = 'none';
            }
        } else {
            contentDiv.innerHTML = "<p>No instructions available</p>";
            navDiv.style.display = 'none';
        }
    });
}


// 🔹 Load Instructions Initially
loadInstructions();


navigationNextButton.addEventListener("click", () => {
    chrome.storage.local.get(["stepInstructions"], (data) => {
        if (data.stepInstructions && data.stepInstructions.Instructions) {
            if (currentStepIndex === 0) {
                navigationNextButton.innerHTML = 'Start';
            }

            if (currentStepIndex === data.stepInstructions.Instructions.length - 1) {
                navigationNextButton.innerHTML = "Finish";
                navigationNextButton.addEventListener("click", () => {
                    chrome.storage.local.remove(["stepInstructions", "currentStepIndex", "clickableElements"], () => {
                        stepsDiv.style.display = 'none';
                    })
                })
            } else {
                navigationNextButton.innerHTML = 'Next';
                currentStepIndex++; // Move to next step
                updateStepContent();
                chrome.storage.local.set({ currentStepIndex }); // Save index
            }

            togglePrevButtonVisibility(); // Update visibility
        }
    });
});


function togglePrevButtonVisibility() {
    navigationPrevButton.style.display = currentStepIndex === 0 ? 'none' : 'block';
}

navigationPrevButton.addEventListener("click", () => {
    if (currentStepIndex > 0) {
        currentStepIndex--; // Move to previous step
        updateStepContent();
        chrome.storage.local.set({ currentStepIndex }); // Save index
    }

    togglePrevButtonVisibility(); // Update visibility
});

togglePrevButtonVisibility();
function updateStepContent() {
    chrome.storage.local.get(["stepInstructions"], (data) => {
        if (data.stepInstructions && data.stepInstructions.Instructions) {
            contentDiv.innerHTML = data.stepInstructions.Instructions[currentStepIndex]?.content || "<p>No instructions available</p>";
        }
    });
}


// Toggle visibility on click
persistentPopupdiv.addEventListener('click', () => {
    stepsDiv.style.display = stepsDiv.style.display === 'none' ? 'block' : 'none';
});
