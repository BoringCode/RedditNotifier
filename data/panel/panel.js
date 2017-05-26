/* Panel.js
 * Displays unread messages in the addon panel
 */
console.log("HELLO");

(function() {
   "use strict";

   console.log(config);

   var messageList = document.querySelector(".message-list");
   var items = [];
   var unread = {};

   //Function called when user clicks on message
   var open = function(obj) {
      self.port.emit("open", obj);
   }

   var resetMessageList = function() {
      //Loop through and properly delete each element
      for (var i = 0; i < items.length; i++) {
         items[i].removeEventListener("click", itemClick);
         messageList.removeChild(items[i]);
      }
      items = [];
      messageList.innerHTML = "";
   }

   var itemClick = function(e) {
      open(unread[this.dataset.key]);
      e.preventDefault();
      return false;
   }

   //Fills message list when panel is shown
   /*self.port.on("show", function(data) {
      unread = data;
      var obj;
      //Reset message list
      resetMessageList();
      //Loop through messages passed in
      for (var prop in unread) {
         obj = unread[prop];
         //Create element and add it to the message list
         var item = document.createElement("li");
         item.setAttribute("data-key", prop);
         items.push(item);
         item.textContent = obj.message;
         messageList.appendChild(item);
         //On click, open the the unread message
         item.addEventListener("click", itemClick);
      }
   });*/
})();
