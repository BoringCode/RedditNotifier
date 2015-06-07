//Reddit Notifier main.js!
//This is where the magic happens

"use strict";

//Get dependencies
var data = require('sdk/self').data;
var prefs = require("sdk/simple-prefs");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var timers = require("sdk/timers");
var tabs = require("sdk/tabs");
var worker = require("sdk/page-worker");
var ui = require("sdk/ui");
var panels = require("sdk/panel");
var ss = require("sdk/simple-storage");

var config = {
	name: "RedditNotifier",
	urls: {
		unreadMessage: "http://www.reddit.com/message/unread/",
		unreadModerator: "http://www.reddit.com/message/moderator/unread/",
		login: "https://ssl.reddit.com/login",
		install: "http://bradleyrosenfeld.com/RedditNotifier",
		newPosts: "http://www.reddit.com/r/%subreddit%/new/",
		newPostsJSON: "http://www.reddit.com/r/%subreddit%/new.json",
	},
	unreadURLS: {
		newPosts: {},
		unreadMessage: "http://www.reddit.com/message/unread.json",
		unreadModerator: "http://www.reddit.com/message/moderator/unread.json",
	},
	ignore: [],
	messages: {
		unreadMessage: "%x% new message(s)",
		unreadModerator: "%x% new moderator mail message(s)",
		newPosts: "There are new posts in: /r/%x%",
		loggedOut: "It looks like you are logged out of Reddit.\nTry logging in."
	},
	//multiplied by 1000 to get seconds, minus to 1000 to take into account delay when loading new data
	refreshTime: prefs.prefs.timing*1000 - 1000,
	forceShow: prefs.prefs.forceShow,
	delayLoad: 5000,
	icons: {
		default: {
			"16": data.url("icon/default/icon-16.png"),
			"32": data.url("icon/default/icon-32.png"),
			"64": data.url("icon/default/icon-64.png"),
		},
		reload: {
			"16": data.url("icon/reload/icon-16.png"),
			"32": data.url("icon/reload/icon-32.png"),
			"64": data.url("icon/reload/icon-64.png"),
		},
		unread: {
			"16": data.url("icon/unread/icon-16.png"),
			"32": data.url("icon/unread/icon-32.png"),
			"64": data.url("icon/unread/icon-64.png"),
		},
		logo: data.url("icon-logo.png")
	},
	alert: "alert.wav",
	volume: prefs.prefs.volume*0.01,
	toolbar: {
		id: "redditnotifierbutton",
		tooltip: "RedditNotifier\nClick to open inbox",
	}
}

var main = {
	timer: null,
	unread: {},
	totalUnread: 0,
	//Called by the browser at runtime
	init: function(options, callbacks) {
		var self = this;

		//This function handles preferences
		prefs.on("", self.prefChange.bind(self));
		if (prefs.prefs.modMail === false) {
			config.ignore.push("unreadModerator");
		}
		if (prefs.prefs.checkMail === false) {
			config.ignore.push("unreadMessage");
		}

		//If the user has set subreddits to check for new posts, load them up
		self.loadSubreddits();

		//generate UI
		self.createUI();

		//first run or update
		if (options.loadReason === "install" || options.loadReason === "upgrade") {
			self.install();
		}

		//Set the internal update timer
		self.timer = timers.setTimeout(self.update.bind(self), config.delayLoad);

		return self;
	},
  	//Runs on addon install
	install: function() {
		var self = this;
		timers.setTimeout(function() {
			self.openTab(config.urls.install);
		}, config.delayLoad);
		return self;
	},
	createUI: function() {
		var self = this;
		self.addonButton = ui.ToggleButton({
			id: config.toolbar.id,
			label: config.toolbar.tooltip,
			icon: config.icons.default,
			badgeColor: "#336699",
			onChange: function(state) {
				//this.state('window', null);
				//this.checked = false;
				//self.openUnreadTab();
				if (state.checked) {
					self.messagesPanel.show({
						position: self.addonButton
					});
					self.messagesPanel.port.emit("show", self.numUnread);
				}
			}
		});
		self.messagesPanel = panels.Panel({
			contentURL: data.url("panel/panel.html"),
			contentScriptFile: data.url("panel/panel.js"),
			onHide: function() {
				self.addonButton.state('window', {checked: false});
			}
		});
		return self;
	},
	triggerButton: function(data) {
		var self = this;
		self.addonButton.click();
		return self;
	},
	loadSubreddits: function() {
		var self = this;
		//clear the old subs and remake the url list
		for (var subreddit in config.unreadURLS.newPosts) {
			delete self.unread[subreddit];
		}
		config.unreadURLS.newPosts = {};
		//Check if user has set the subreddits pref
		if (prefs.prefs.subreddits !== undefined && prefs.prefs.subreddits.trim() !== "") {
			//split on comma
			var subreddits = prefs.prefs.subreddits.split(",");
			//loop through each subreddit and add it to the list
			for (var index in subreddits) {
				var subreddit = subreddits[index].trim();
				//Make sure user only put in a valid subreddit name
				if (subreddit.match(/^[a-zA-Z0-9]+$/)) {
					config.unreadURLS.newPosts[subreddit] = config.urls.newPostsJSON.replace("%subreddit%", subreddit);
				}
			}
		}
		return self;
	},

	update: function() {
		var self = this;
		timers.clearTimeout(self.timer);
		//change the button icon to reflect the refresh
		self.updateButton({type: "reload", disabled: true})
		//Loop through the unread urls
		for (var key in config.unreadURLS) {
			//check to see if I should ignore this unread URL
			if (config.ignore.indexOf(key) === -1) {
				//Make sure the current url isn't an object
				if (typeof(config.unreadURLS[key]) !== "object") {
					self.runRequest(key);
				} else {
					//Loop through the urls in the object
					for (var subKey in config.unreadURLS[key]) {
						self.runRequest(subKey, key);
					}
				}
			}
			//Is this the last URL to check?
			var keys = Object.keys(config.unreadURLS);
			if (key === keys[keys.length - 1]) {
				//Keys aren't always looped in order, so delay for one second to compensate
				//This will fix most failures to register new messages
				//Kind of hacky as it is, but meh.
				timers.setTimeout(self.generateMessages.bind(self), 1000);
			}
		}
		return self;
	},
	runRequest: function(key, parentKey) {
		var self = this;
		var url = config.unreadURLS[key];
		if (parentKey) {
			url = config.unreadURLS[parentKey][key];
		}
		//Run the request to reddit
		request.Request({
			url: url,
			onComplete: function(data) {
				//Make sure the data exists before attempting to count
				if (data.json !== null && data.json.hasOwnProperty("data")) {
					//Call the count messages function with the messages
					self.countMessages(data.json["data"]["children"], key, parentKey);
				}
			}
		}).get();
		return self;
	},
	//Counts the number of messages in the data from reddit
	countMessages: function(messages, key, parentKey = false) {
		var self = this;
		var unread = 0;
		var time = 0;
		//Count the number of messages and record the time of the oldest message
		for (var message in messages) {
			if (messages.hasOwnProperty(message)) {
				time = messages[message]["data"]["created_utc"];
				//If looping through subreddit, get the first post only
				unread++;
				if (parentKey) { break; }
			}
		}

		var oldCount = 0, oldTime = 0, checked = false;

		//Load the old unread object
		if (key in self.unread) {
			oldCount = self.unread[key].count;
			checked = self.unread[key].checked;
		}
		//Load the times
		var times = self.getStorage("times");
		//Make sure that there are previous times before setting it
		if (times && (key in times)) {
			oldTime = times[key];
		}

		//Create unread object
		self.unread[key] = {
			//Set the count to 0 if this post isn't newer and it hasn't been checked, else set it to the unread variable
			count: (parentKey && oldTime >= time && checked) ? 0 : unread,
			time: time,
			type: parentKey,
			alert: false,
			checked: checked
		};

		//Only alert the user if something has changed
		if (parentKey && time > oldTime) {
			self.unread[key].alert = true;
		} else if (unread > oldCount) {
			self.unread[key].alert = true;
		}

		//Set the oldest checked time to the storage
		//Enables continuity between browser restarts
		self.setStorage("times", key, time);
		return self;
	},

	generateMessages: function() {
		var self = this;
		//Reset the unread total
		self.totalUnread = 0;
		var completeMessage = "";

		//Loop through the unread object
		for (var key in self.unread) {
			var unreadObj = self.unread[key];
			//Update the total unread count
			self.totalUnread += unreadObj.count;
			//Generate the notification message if there is new stuff to show
			if (unreadObj.alert) {
				//Load the message template based upon the type or the key name
				var message;
				//Display the name of the message type in the message (used with subreddits)
				if (unreadObj.type) {
					message = config.messages[unreadObj.type].replace("%x%", key);
				//Display the number of messages in the message
				} else {
					message = config.messages[key].replace("%x%", self.unread[key].count);
				}
				completeMessage += message + "\n";
			}
		}
		//Only show message if there are new messages
		if (completeMessage !== "") {
			//Click the addon button when the notification is clicked
			self.notify("New Messages", completeMessage, true, self.triggerButton.bind(self));
		}

		//Set the button back to the default
		var buttonState = {type: "default", disabled: false};
		//If there are unread posts or messages, set the button
		if (self.totalUnread > 0) {
			buttonState.badge = self.totalUnread;
			buttonState.type = "unread";
		}
		self.updateButton(buttonState);

		//Call update function again after set amount of time
		self.timer = timers.setTimeout(self.update.bind(self), config.refreshTime);
		return self;
	},

	//Updates the addon button with the passed object's properties
	updateButton: function(opts) {
		var self = this;
		if (!opts) return self;
		if (opts.type) {
			self.addonButton.icon = config.icons[opts.type];
		}
		self.addonButton.disabled = opts.disabled;
		if (opts.badge) {
			self.addonButton.badge = opts.badge;
		} else {
			self.addonButton.badge = null;
		}
		return self;
	},

	//Wrapper for the notify function, plays a sound as well
	notify: function(title, text, alert, callback, passData) {
		var self = this;
		//Only show notifications if the user wants them
		if (prefs.prefs.showNotifications) {
			//Only play sound if user wants them and alert is true
			//Errors are silent
			if (prefs.prefs.playAlert && alert) {
				//play a sound on a page worker
				//Sound from http://freesound.org/people/KIZILSUNGUR/sounds/72127/
				//Thanks KIZILSUNGUR!
				worker.Page({
					contentScript: "var audio = new Audio('" + config.alert + "'); audio.volume = " + config.volume + "; audio.play();",
					contentURL: data.url("alert/alert.html")
				});
			}
			notifications.notify({
				title: config.name + " - " + title,
			 	text: text,
			 	iconURL: config.icons.unread["64"],
			 	data: passData,
			 	onClick: function(passData) {
			 		if (typeof(callback) === 'function') {
			 			callback(passData);
			 		}
			 	}
			});
		}
		return self;
	},

	openTab: function(url) {
		var self = this;
		//check if already open
		for each (var tab in tabs) {
			//If already open, reload and then switch to the tab
			if (tab.url === url) {
				tab.reload();
				tab.activate();
				return;
			}
		}
		tabs.open(url);
		return self;
	},

	prefChange: function(name) {
		var self = this;
		var pref = prefs.prefs[name];
		if (name === "timing") {
			//Change the refresh time to the new value
			if (pref >= 10) {
				config.refreshTime = pref*1000 - 1000;
			} else {
				config.refreshTime = 9000;
			}
		} else if (name === "volume") {
			//Change the volume
			if (pref <= 100) {
				config.volume = pref*0.01;
			} else {
				config.volume = 1;
			}
		} else if (name === "modMail") {
			if (pref === false) {
				config.ignore.push("unreadModerator");
				self.newUnread["unreadModerator"] = 0;
			} else {
				delete config.ignore[config.ignore.indexOf("unreadModerator")];
			}
		} else if (name === "checkMail") {
			if (pref === false) {
				config.ignore.push("unreadMessage");
				self.newUnread["unreadMessage"] = 0;
			} else {
				delete config.ignore[config.ignore.indexOf("unreadMessage")];
			}
		} else if (name === "subreddits") {
			self.loadSubreddits();
		}
		return self;
	},

	setStorage: function(parentKey, key, value = false) {
		var self = this;
		if (!(parentKey in ss.storage)) { ss.storage[parentKey] = {}; };
		if (value === false) {
			ss.storage[parentKey] = key;
		} else {
			ss.storage[parentKey][key] = value;
		}
		return self;
	},
	getStorage: function(key) {
		var self = this;
		return ss.storage[key];
	},
};

exports.main = function(options, callback) {
	main.init(options, callback);
}
