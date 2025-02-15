chrome.action.onClicked.addListener((tab) => {
    if (!tab.url.includes("aws.amazon.com")) {
      console.error("This script only runs on AWS pages.");
      return;
    }
  
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    }).catch(err => console.error("Script injection failed:", err));
  });
  