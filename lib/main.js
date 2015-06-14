/*
 * RedditNotifier
 * Displays messages and unread counts for reddit
 * version 2.0.2
 */

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

//Configuration object, set at load time
var config = {
	name: "RedditNotifier",
	urls: {
		reddit: "https://www.reddit.com/",
		unreadMessage: "https://www.reddit.com/message/unread/",
		unreadModerator: "https://www.reddit.com/message/moderator/unread/",
		login: "https://ssl.reddit.com/login",
		install: "http://bradleyrosenfeld.com/RedditNotifier",
		newPosts: "https://www.reddit.com/r/%x%/new/",
		newPostsJSON: "http://www.reddit.com/r/%x%/new.json",
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
		tooltip: "RedditNotifier",
	}
};

var main = {
	timer: null,
	addonButton: null,
	messagesPanel: null,
	unread: {},
	totalUnread: 0,
	//Called by the browser at runtime
	init: function(options, callbacks) {
		var self = this;

		//This function handles preferences
		prefs.on("", self.prefChange.bind(self));
		//Call some of the pref changes at load time
		self.prefChange("unreadModerator");
		self.prefChange("unreadMessage");

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
	//Runs when addon is disabled or uninstalled
	cleanup: function(reason) {
		var self = this;
		if (reason === "uninstall") {
			//Removes storage
			self.deleteStorage("times");
			//Should preferences be deleted as well?
		}
		return self;
	},
	createUI: function() {
		var self = this;
		self.addonButton = ui.ToggleButton({
			id: config.toolbar.id,
			label: config.toolbar.tooltip,
			icon: config.icons.default,
			badgeColor: "#336699",
			onChange: self.buttonChange.bind(self)
		});
		self.messagesPanel = panels.Panel({
			contentURL: data.url("panel/panel.html"),
			contentScriptFile: data.url("panel/panel.js"),
			onHide: function() {
				self.addonButton.state('window', {checked: false});
			}
		});
		self.messagesPanel.port.on("open", self.openUnread.bind(self));
		return self;
	},
	buttonChange: function(state) {
		var self = this;
		if (state.checked) {
			//If there are no unread messages, just open reddit
			if (self.totalUnread === 0) {
				//Resets the addon button (no checked state)
				self.addonButton.state('window', {checked: false});
				self.messagesPanel.hide();
				self.openTab(config.urls.reddit);
			} else {
				var unreadObj = [], obj, newObj;
				//Pass unread objects that haven't been checked and generate messages for them
				for (var prop in self.unread) {
					obj = self.unread[prop];
					if (obj.count > 0 && obj.checked === false) {
						//Copies the old object (we are making changes specifically for the panel)
						newObj = Object.assign({}, obj);
						newObj.message = self.generateMessage(prop, obj);
						newObj.name = prop;
						unreadObj.push(newObj);
					}
				}
				//More than one unread object, open the panel
				if (unreadObj.length > 1) {
					//Show the panel and hook it to the button
					self.messagesPanel.show({
						position: self.addonButton
					});
					self.messagesPanel.port.emit("show", unreadObj);
				//There is only one unread object, go directly to it
				} else if (unreadObj.length === 1) {
					self.addonButton.state('window', {checked: false});
					self.messagesPanel.hide();
					self.openUnread(unreadObj[0]);
				}
			}
		} else {
			//Hide the panel
			self.messagesPanel.hide();
		}
		return self;
	},
	triggerButton: function(data) {
		var self = this;
		self.addonButton.click();
		return self;
	},
	loadSubreddits: function() {
		var self = this;
		//Check if user has set the subreddits pref
		if (prefs.prefs.subreddits !== undefined && prefs.prefs.subreddits.trim() !== "") {
			//Split subreddits on comma, trims each subreddit, and then makes sure it is a valid subreddit
			var subreddits = prefs.prefs.subreddits.split(",").map(function(subreddit) {
				return subreddit.trim();
			}).filter(function(subreddit) {
				return (subreddit.match(/^[a-zA-Z0-9]+$/));
			});
			//Delete subs that have been removed
			for (var subreddit in config.unreadURLS.newPosts) {
				//Remove if not found in new subreddits list
				if (subreddits.indexOf(subreddit) === -1) {
					delete self.unread[subreddit];
					delete config.unreadURLS.newPosts[subreddit];
					self.deleteStorage("times", subreddit);
				}
			}
			//loop through each subreddit and add it to the list
			var subreddit;
			for (var index in subreddits) {
				subreddit = subreddits[index];
				config.unreadURLS.newPosts[subreddit] = config.urls.newPostsJSON.replace("%x%", subreddit);
			}
		} else {
			//If the user has deleted all subreddits, clear them out
			for (var subreddit in config.unreadURLS.newPosts) {
				delete self.unread[subreddit];
				delete config.unreadURLS.newPosts[subreddit];
				self.deleteStorage("times", subreddit);
			}
		}
		return self;
	},
	//Runs everytime we check for new messages
	update: function() {
		var self = this;
		var keys = Object.keys(config.unreadURLS);
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

		var oldCount = 0, oldTime = 0, checked = true;

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
			checked: checked,
			url: self.generateURL(key, parentKey)
		};

		//Only alert the user if something has changed
		if ((parentKey && time > oldTime) || (parentKey === false && unread > oldCount)) {
			self.unread[key].alert = true;
			self.unread[key].checked = false;
		}

		//Set the oldest checked time to the storage
		//Enables continuity between browser restarts
		self.setStorage("times", key, time);
		return self;
	},

	//Create messages and show notifications after all the data has been loaded
	generateMessages: function() {
		var self = this;
		//Reset the unread total
		self.totalUnread = 0;
		var completeMessage = "";

		//Loop through the unread object
		var unreadObj;
		for (var key in self.unread) {
			unreadObj = self.unread[key];
			//Update the total unread count
			self.totalUnread += unreadObj.count;
			//Generate the notification message if there is new stuff to show
			if (unreadObj.alert) {
				//Load the message template based upon the type or the key name
				var message = self.generateMessage(key, unreadObj);
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
	//Function to create message from object
	generateMessage: function(key, obj) {
		var self = this;
		var message;
		//Display the name of the message type in the message (used with subreddits)
		if (typeof(obj.type) !== "boolean" && obj.type) {
			message = config.messages[obj.type].replace("%x%", key);
		//Display the number of messages in the message
		} else {
			message = config.messages[key].replace("%x%", obj.count);
		}
		return message;
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

	//Generates URL to visit from key
	generateURL: function(key, parentKey) {
		var self = this;
		var url;
		if (typeof(parentKey) === "boolean" && !parentKey) {
			url = config.urls[key].replace("%x%", key);
		} else {
			url = config.urls[parentKey].replace("%x%", key);
		}
		return url;
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

	//Opens unread message from object
	//Resets unread count and addon button
	openUnread: function(obj) {
		var self = this;
		//Closes the panel
		self.messagesPanel.hide();
		//Open the message url
		self.openTab(obj.url);
		//Reset count and unread object
		self.totalUnread -= obj.count;
		self.unread[obj.name].count = 0;
		self.unread[obj.name].checked = true;
		//Set the button back to the default
		var buttonState = {type: "default", disabled: false};
		//If there are unread posts or messages, set the button
		if (self.totalUnread > 0) {
			buttonState.badge = self.totalUnread;
			buttonState.type = "unread";
		}
		self.updateButton(buttonState);
		return self
	},

	//Opens url in a new tab
	openTab: function(url) {
		var self = this;
		//check if already open
		var tab;
		for (var index in tabs) {
			tab = tabs[index];
			//If already open, reload and then switch to the tab
			if (tab.url === url) {
				tab.reload();
				tab.activate();
				return self;
			}
		}
		tabs.open(url);
		return self;
	},

	//Called whenever the user changes a preference
	prefChange: function(name) {
		var self = this;
		var pref = prefs.prefs[name];
		switch (name) {
			case "timing":
				//Change the refresh time to the new value
				if (pref >= 10) {
					config.refreshTime = pref*1000 - 1000;
				} else {
					config.refreshTime = 9000;
				}
				break;
			case "volume":
				//Change the volume
				if (pref <= 100) {
					config.volume = pref*0.01;
				} else {
					config.volume = 1;
				}
				break;
			case "subreddits":
				self.loadSubreddits();
				break;
			//Default is to add pref to ignore list
			default:
				if (pref === false) {
					config.ignore.push(name);
					//Remove from unread object
					delete self.unread[name];
				} else {
					//Remove from ignore list
					config.ignore.splice(config.ignore.indexOf(name), 1);
				}
		}
		return self;
	},

	//Wrapper around the storage API to make it easier to use for my purposes
	setStorage: function(parentKey, key, value) {
		var self = this;
		if (!(parentKey in ss.storage)) { ss.storage[parentKey] = {}; };
		if (typeof(value) === "undefined") {
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
	deleteStorage: function(parentKey, key) {
		var self = this;
		//Make sure the item exists before deleting
		if (parentKey in ss.storage) {
			if (!key) {
				delete ss.storage[parentKey];
			//Ensure the child key exists
			} else if (key in ss.storage[parentKey]) {
				delete ss.storage[parentKey][key];
			}
		}
		return self;
	}
};

exports.main = function(options, callback) {
	main.init(options, callback);
}

exports.onUnload = function(reason) {
	main.cleanup(reason);
}
