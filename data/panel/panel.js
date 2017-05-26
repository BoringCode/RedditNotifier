/* 
 * Panel.js
 * Displays unread messages in the addon panel
 */

"use strict";

// Get messages from background script
browser.runtime.sendMessage({ type: "getMessages" }, function(response) {
   if (typeof(response) !== "object") return;

   var messageList = document.querySelector(".message-list");
   var items = [], i, item; 

   // Create elements that users can click
   for (i = 0; i < response.length; i++) {
      if (!("action" in response[i])) continue;
      item = document.createElement("li");
      item.setAttribute("data-action", response[i]["action"]);
      items.push(item);
      item.textContent = response[i]["message"];
      messageList.appendChild(item);
      //On click, open the the unread message
      item.addEventListener("click", itemClick);
   }
})

// Send message to main background script to update the things
var itemClick = function(e) {
   browser.runtime.sendMessage({
      type: "openTab",
      action: this.dataset.action
   }, function(response) {
      // Close popup
      window.close();
   })
   e.preventDefault();
   return false;
}
