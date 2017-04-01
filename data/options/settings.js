/*
 * Settings()
 * Generates a settings form and automatically handles saves
 */
var Settings = function(element) {
	var self = this;

	self.element = (typeof(element) === "object") ? element : document.querySelector(element);

	/*
	 * Very, very simple template engine
	 */
	var templater = function(html){
		return function(data) {
			var replaced = html, x, re, template;
			for(x in data){
				re = "{{\\s?" + x + "\\s?}}";
				replaced = replaced.replace(new RegExp(re, "ig"), data[x]);
			}
			template = document.createElement("template");
			template.innerHTML = replaced;
			return template.content.firstChild;
		};
	};

	// Map option types with their respective input element
	var types = {
		"bool": {
			"html": templater('<input type="checkbox" name="{{name}}" id="{{name}}">')
		},
		"string": {
			"html": templater('<input type="text" name="{{name}}" id="{{name}}">')
		},
		"integer": {
			"html": templater('<input type="number" name="{{name}}" id="{{name}}" min="{{min}}" max="{{max}}">')
		}
	};

	/*
	 * saveSetting() - Saves setting of input on change
	 * e: event object
	 */
	var saveSetting = function(e) {
		var obj = {};
		// Check whether field is in valid state before saving
		if (!e.target.validity.valid) return false;
		// Get checked status if checkbox, else get the value
		obj[e.target.id] = (e.target.type === "checkbox") ? e.target.checked : e.target.value;
		// Save in browser local storage
		browser.storage.local.set(obj);
	}

	var required = ["name", "title", "type"];
	var loadSetting = function(obj) {
		var setting = {};
		// Container element for label, input, and description
		var element = document.createElement("div");

		// Test: param is type object
		if (typeof(obj) !== "object") return false;
		// Test: object has required keys
		for (var i = 0; i < required.length; i++) { if (!(required[i] in obj)) return false; }
		
		// Test: valid setting type
		if (!(obj["type"] in types)) return false;
		var type = obj["type"];

		// Name of setting
		var name = obj["name"];
		// Title is displayed to users
		var title = obj["title"];
		// Grab default value
		var value = ("value" in obj) ? obj["value"] : "";

		var label = templater('<label for="{{name}}">{{title}}</label>');
		self.element.appendChild(label({
			"name": name,
			"title": title
		}));

		// Load input template
		var input = types[type]["html"]({
			"name": name,
			"title": title,
			"min": ("min" in obj) ? obj["min"] : "",
			"max": ("max" in obj) ? obj["max"] : ""
		});
		self.element.appendChild(input);
		input.addEventListener("change", saveSetting);

		// Add description 
		if ("description" in obj) {
			var description = templater("<p class='description'>{{description}}</p>");
			self.element.appendChild(description({
				"description": obj["description"]
			}));
		}

		self.element.appendChild(element);

		// WHY THE F**K DOES THE STORAGE API RETURN A PROMISE?
		var promise = browser.storage.local.get(obj["name"]);
		promise.then(function(result) {
			result = (name in result) ? result[name] : value
			if (type === "bool") {
				input.checked = result;
			} else {
				input.value = result;
			}
		}, function(error) {
			console.log(`Error: ${error}`);
		});

		return true;
	};

	Settings.prototype.load = function(settings) {
		for (var i = 0; i < settings.length; i++) {
			loadSetting(settings[i]);
		}
	};
};

var settings = new Settings("#options");
settings.load(options);