//Reddit Notifier - v0.1

//Get dependencies
var data = require('self').data;
var prefs = require("sdk/simple-prefs");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var timers = require("sdk/timers");
var windowutils = require("window-utils");
var toolbarbutton = require("./toolbarbutton");
var userstyles = require("./userstyles");

var config = {
	name: "RedditNotifier",
	unreadURL: "http://www.reddit.com/message/unread.json",
	delayLoad: 2000,
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
		tooltip: "Click to open inbox, middle click to refresh",
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
	numUnread: 0,
	error: false,

	init: function(options, callbacks) {
		//do stuff on load of the addon
		main.onLoad(options.loadReason);
	},
	onLoad: function(loadReason) {
		console.log(loadReason);
		//create button for refreshing/opening inbox
		main.addonButton = toolbarbutton.ToolbarButton({
			id: config.toolbar.id,
		  	label: config.name,
		  	tooltiptext: config.toolbar.tooltip,
		  	textColor: config.toolbar.textColor,
		  	backgroundColor: config.toolbar.backgroundColor,
		  	onClick: function (e) {
		  		if (e.button == 1 || (e.button == 0 && e.ctrlKey)) {
		  			main.update();
		  		}
		  	},
		  	onCommand: function () {
				console.log("Clicked");
		  	}
		});
		//This should probably only run if the loadReason is an install
		if (loadReason) {
			main.addonButton.moveTo(config.toolbar.move);
		}
		//Sets the image and such
		userstyles.load(data.url("overlay.css"));
		//run the for the first time, don't do it right when the browser loads though
		timers.setTimeout(main.update, config.delayLoad);
	},
	update: function() {
		//store the old number for comparison
		var oldNum = main.numUnread;
		//get the number of unread items
		var unread = main.requestUnread();
		//user is logged out (only display once per session)
		if (!unread) {
			if (!main.error) {
				main.notify("Error", config.errors.loggedOut, function() {
					console.log("Error clicked");
				});
				main.error = true;
			}
		} else {
			main.error = false;
			//continue on with your lives
			main.numUnread = unread;
			//There are probably new messages
			if (main.numUnread > oldNum) {
				main.notify("New Messages", "There are " + main.numUnread + " unread messages.", function() {
					console.log("Notification clicked");
				});
			}
			//change the badge
			main.addonButton.badge = main.numUnread;
			//change the icon
			if (main.numUnread > 0) {
				main.addonButton.type = "unread";
			} else {
				main.addonButton.type = "read";
			}
		}
	},
	requestUnread: function() {
		request.Request({
			url: config.unreadURL,
			onComplete: function (response) {
				if ("data" in response) {
					var data = response["data"]["children"];
					console.log(data.length);
					return 1;
				} else {
					return false;
				}
			}
		}).get();
		//Testing
		//return 1;
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
	}
}

exports.main = main.init;