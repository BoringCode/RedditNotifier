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
	delayLoad: 2000,
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
		main.timer = timers.setTimeout(main.update, config.delayLoad);
	},
	update: function() {
		timers.clearTimeout(main.timer);
		//runs the request, calls the updateButton function
		main.requestUnread();
		//call again after set amount of time
		main.timer = timers.setTimeout(main.update, config.checkTime);
	},
	updateButton: function(unread) {
		//store the old number for comparison
		var oldNum = main.numUnread;
		//user is logged out (only display once per session, resets if user is logged in)
		if (!unread) {
			if (!main.error) {
				main.notify("Error", config.errors.loggedOut, function() {
					main.openTab(config.urls.login);
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
					main.openTab(config.urls.unreadMessage);
				});
			}
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
		}
	},
	requestUnread: function() {
		request.Request({
			url: config.urls.unreadMessageJSON,
			onComplete: function (response) {
				if ("data" in response) {
					var data = response["data"]["children"];
					console.log(data.length);
					main.updateButton(1);
				} else {
					main.updateButton(false);
				}
			}
		}).get();
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