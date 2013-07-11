//Reddit Notifier - v0.1

//Get dependencies
var data = require('self').data;
var prefs = require("sdk/simple-prefs");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var timers = require("sdk/timers");
var tabs = require("sdk/tabs");
var windowutils = require("window-utils");
var toolbarbutton = require("./toolbarbutton");
var userstyles = require("./userstyles");

var config = {
	name: "RedditNotifier",
	urls: {
		unreadMessage: "http://www.reddit.com/message/unread/",
		unreadMessageJSON: "http://www.reddit.com/message/unread.json",
		login: "https://ssl.reddit.com/login"
	},
	//set with preference later
	checkTime: 5000,
	icons: {
		big: data.url("reddit-notifier-icon.png"),
		small: data.url("reddit-notifier-icon-small.png"),
		smallUnread: data.url("reddit-notifier-icon-small-unread.png")
	},
	errors: {
		loggedOut: "It looks like you are logged out of Reddit. Try logging in."
	},
	toolbar: {
		id: "redditnotifierbutton",
		tooltip: "RedditNotifier\nClick to open inbox, middle click to refresh",
		backgroundColor: "#ff3f00",
		textColor: "#FFF",
	    move: {
	      toolbarID: "nav-bar",
	      insertBefore: "home-button",
	      forceMove: false
	    }
	}
}

var main = {
	addonButton: null,
	timer: null,
	numUnread: 0,
	error: false,
	//Called by the browser at runtime
	init: function(options, callbacks) {
		//do stuff on load of the addon
		console.log(options.loadReason);
		//create button for refreshing/opening inbox
		main.addonButton = toolbarbutton.ToolbarButton({
			id: config.toolbar.id,
		  	label: config.name,
		  	tooltiptext: config.toolbar.tooltip,
		  	textColor: config.toolbar.textColor,
		  	backgroundColor: config.toolbar.backgroundColor,
		  	onClick: function (e) {
		  		if (e.button == 1 || (e.button == 0 && e.ctrlKey)) {
		  			//reset the error
		  			main.error = false;
		  			main.update();
		  		}
		  	},
		  	onCommand: function () {
				main.openTab(config.urls.unreadMessage);
		  	}
		});
		//This should probably only run if the options.loadReason is an install
		if (options.loadReason) {
			main.addonButton.moveTo(config.toolbar.move);
		}
		//Sets the image and such
		userstyles.load(data.url("overlay.css"));
		//run the for the first time, don't do it right when the browser loads though
		main.timer = timers.setTimeout(main.update, config.checkTime);
	},
	update: function() {
		timers.clearTimeout(main.timer);
		//runs the request, calls the updateButton function
		request.Request({
			url: config.urls.unreadMessageJSON,
			onComplete: function (returned) {
				var response = returned.json;
				//check if logged in
				if (response.hasOwnProperty("data")) {
					//store the old number for comparison
					var oldNum = main.numUnread;
					//Store the array of messages
					//Let's make this smarter someday. Store the timestamp
					var messages = response["data"]["children"];
					//Get the number
					main.numUnread = 0;
					//Count the number of messages
					for (var message in messages) {
						if (messages.hasOwnProperty(message)) {
							main.numUnread++;
						}
					}
					//There are no errors!
					main.error = false;
					//If the number is greater, alert the user
					if (main.numUnread > oldNum) {
						var numNew = main.numUnread - oldNum;
						//Plural
						if (numNew === 1) {
							var plural = "is";
						} else {
							var plural = "are";
						}
						main.notify("New Messages", "There " + plural +" " + numNew + " new message(s).", function() {
							main.openTab(config.urls.unreadMessage);
						});
					}
					main.updateButton();
				} else {
					//logged out
					main.numUnread = 0;
					if (!main.error) {
						main.notify("Error", config.errors.loggedOut, function() {
							main.openTab(config.urls.login);
						});
						main.error = true;
					}
					main.updateButton(main.numUnread);
				}
				//call again after set amount of time
				main.timer = timers.setTimeout(main.update, config.checkTime);
			}
		}).get();
	},
	updateButton: function() {
		//change the badge
		if (main.numUnread >= 10) {
			main.addonButton.badge = "∞";
		} else {
			main.addonButton.badge = main.numUnread;
		}
		//change the icon
		if (main.numUnread > 0) {
			main.addonButton.type = "unread";
		} else {
			main.addonButton.type = "read";
		}
	},
	notify: function(title, text, callback, data) {
		notifications.notify({
			title: config.name + " - " + title,
		 	text: text,
		 	iconURL: config.icons.big,
		 	data: data,
		 	onClick: function(data) {
		 		if (typeof(callback) === 'function') {
		 			callback(data);
		 		}
		 	}
		});
	},
	openTab: function(url) {
		//check if already open
		for each (var tab in tabs) {
			if (tab.url === url) {
				//reload and then switch to the tab
				tab.reload();
				tab.activate();
				return;
			}
		}
		tabs.open(url);
	}
}

exports.main = main.init;