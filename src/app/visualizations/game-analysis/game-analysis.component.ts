import { Component, ElementRef, OnInit } from '@angular/core';
import { D3Service, D3 } from 'd3-ng2-service';
import { PapaParseService } from 'ngx-papaparse';
import {ViewEncapsulation} from '@angular/core';

@Component({
	selector: 'app-game-analysis',
	templateUrl: './game-analysis.component.html',
	styleUrls: ['./game-analysis.component.css'],
	//TODO how to solve with encapsulation
	encapsulation: ViewEncapsulation.None
})
export class GameAnalysisComponent implements OnInit {

	private d3: D3;
	private parentNativeElement: any;
	private papa: PapaParseService;

	private bounds: any;
	private xScale: any;
	private yScale: any;
	private xAxis: any;
	private yAxis: any;
	private svg: any;
	private plan: any;
	private planDomain: any;
	private gameDomain: any;
	private planSegments: any;
	private time: any;
	private timeline: any;
	private timeText: any;
	private data: any = [];

	constructor(element: ElementRef, d3Service: D3Service, papa: PapaParseService) {
		this.d3 = d3Service.getD3();
		this.parentNativeElement = element.nativeElement;
		this.papa = papa;
	}

	ngOnInit() {
		this.loadData('assets/user_events_log1.csv');

		var fileIndex: number = 2;
		setInterval(function () {
			if(fileIndex<=20) {
				this.loadData('assets/user_events_log'+fileIndex+'.csv');
				fileIndex++;
			}
		}.bind(this), 5000);
	}

	loadData(file: string) {
		var startTime = 0;
		var index = 0;

		this.papa.parse(file, {
			download: true,
			header: true,
			step: function (row: any) {
				var d = row.data[0],
					datetime = new Date(d.datetime),
					timestamp = datetime.getTime()/1000;

				if((index == 0) || (d.event == "Game started" && parseInt(d.level) == 1 && startTime > timestamp)) {
					startTime = timestamp;
				}

				this.data.push({
					"team" : d.uco,
					"event" : d.event,
					"level" : parseInt(d.level),
					"time" : this.getSeconds(d.time),
					"timestamp" : timestamp
				});

				index++;
			}.bind(this),

			complete: function () {
				this.applyData(startTime);
			}.bind(this)
		});
	}

	applyData(startTime: number) {
		// TODO time plan for each level?
		var levelTimePlan = 1000;
		var gamedataset: any = [],
			plandataset: any = [],
			// stores levels keys for use in d3.stack, in format "level + index" or "start" for start of the game
			levels = ["start"],
			// to get the highest time as current time
			time =  0,
			// map for keys (team id) to game/plan datasets, because datasets must be arrays to use in d3.stack
			teamsMap: any = {};

		this.data.forEach(function(d: any) {
			var eventTime = Math.max(0, d.timestamp - startTime),
				levelKey = "level" + d.level,
				eventType = null;

			// if the team is not in dataset yet, it is added to game/plan datasets and map
			if(teamsMap[d.team] == null) {
				teamsMap[d.team] = gamedataset.length;
				gamedataset[teamsMap[d.team]] = {};
				gamedataset[teamsMap[d.team]]["team"] = d.team;
				gamedataset[teamsMap[d.team]]["events"] = [];

				plandataset[teamsMap[d.team]] = {};
				plandataset[teamsMap[d.team]]["team"] = d.team;
				plandataset[teamsMap[d.team]]["start"] = 0;
			}

			// delete possibly recorded higher levels from some previous game
			var tmpLevel = d.level+1;
			while((gamedataset[teamsMap[d.team]]["level" + tmpLevel] != undefined) && (tmpLevel < levels.length)) {
				delete gamedataset[teamsMap[d.team]]["level" + tmpLevel];
				tmpLevel++;
			}
			// if there was some previous data, delete also its events
			if(tmpLevel > (d.level+1)) gamedataset[teamsMap[d.team]]["events"] = [];

			// add level to levels array, if it does not contain it
			if(levels.indexOf(levelKey)  == -1) levels.push(levelKey);

			if(time < d.timestamp) time = d.timestamp;

			// according to type of event, add it to events array of the team and/or store the time of level end
			switch(d.event) {
				case "Game started":
					// start at 0 time, not added to structure
					eventType = null;
					if(d.level == 1) {
						//if the first level started, save start of game as level 0 end
						gamedataset[teamsMap[d.team]]["start"] = eventTime;
					}
					break;
				case "Returned from help level":
					eventType = "solution";
					break;
				case "Correct flag submited":
					eventType = null;
					// level is finished, save the time (shifted by start time)
					gamedataset[teamsMap[d.team]][levelKey] = d.time;
					break;
				case "Level cowardly skipped":
					eventType = "skip";
					// level is finished, save the time
					gamedataset[teamsMap[d.team]][levelKey] = d.time;
					break;
				default:
					if(d.event.substr(0,4) == 'Hint')
						eventType = "hint";
					else eventType = null;
					break;
			}

			if(eventType != null) {
				var event = {
					"type" : eventType,
					"name" : d.event,
					"time" : eventTime,
					"level" : d.level
				}
				gamedataset[teamsMap[d.team]]["events"].push(event);
			}    
		});

		plandataset.forEach(function(team: any) {
			levels.forEach(function(level) {
				team[level] = (level != "start") ? levelTimePlan : 0;
			});
		});
		

		var game = {
			"time" : time - startTime,
			"keys" : levels,
			"teams" : gamedataset
		}

		var plan = {
			"keys" : levels,
			"teams" : plandataset
		}

		// level 0 transparent color, other modulo i (transparent exlude)
		var gamedata = game,
			gameColors = ["transparent", "#1c89b8", "#20ac4c", "#ff9d3c", "#fc5248"],
			icons = { "hint" : "\uf111", "solution" : "\uf00c", "skip" : "\uf00d" };
		// level 0 transparent color, other modulo i (transparent exlude)
		var plandata = plan,
			planColors = ["transparent", "#0e6f90", "#158136", "#ec7e26", "#d82f36"];

		this.drawPlan({
			data: plandata,
			element: 'chart',
			colors: planColors,
			time: 0,
		});
		this.drawData({
			data: gamedata,
			colors: gameColors,
			icons: icons,
			time: gamedata.time
		});
	}

	drawPlan(config: any) {
		var d3 = this.d3;
		var element = config.element,
			plandata = config.data,
			padding = { top: 50, right: 20, bottom: 20, left: 80 },
			width = 1000 - padding.left - padding.right,
			height = 600 - padding.top - padding.bottom,
			timeWidth = 130;

		var colors = config.colors;
		var getColor = d3.scaleOrdinal(colors);

		var stack = d3.stack()
			.keys(plandata.keys)
			.offset(d3.stackOffsetNone);

		var layers = stack(plandata.teams);

		this.time = config.time;
		this.planDomain = d3.max(layers[layers.length - 1], function(d) { return d[1]; }) + 500 //rezerva na přetečení;

		this.xScale = d3.scaleLinear().rangeRound([0, width]),
		this.yScale = d3.scaleBand().rangeRound([height, 0]).padding(0.02),
		this.xAxis = d3.axisBottom(this.xScale),
		this.yAxis = d3.axisLeft(this.yScale),
		d3.select("#" + element).html('');
		this.svg = d3.select("#" + element).append("svg")
				.attr("width", width + padding.left + padding.right)
				.attr("height", height + padding.top + padding.bottom)
				.append("g")
				.attr("transform", "translate(" + padding.left + "," + padding.top + ")");


		this.yScale.domain(plandata.teams.map(function(d: any) { return d.team; }));
		this.xScale.domain([0, this.planDomain]);
		this.yScale.domain(plandata.teams.map(function(d: any) { return d.team; }));  

		this.plan = this.svg.append("g")
			.attr("class", "plan");

		// create hatched pattern defs
		var defs = this.plan.append("defs");
		var pattern = defs.selectAll("pattern")
			.data(plandata.keys)
			.enter().append("pattern")
			.attr("id", function(d: any, i: string) { return "diagonalHatch"+i; })
			.attr("patternUnits", "userSpaceOnUse")
			.attr("width", "7")
			.attr("height", "4")
			.attr("patternTransform", "rotate(45)");
		pattern.append("rect")
			.attr("width", "3")
			.attr("height", "4")
			.attr("transform", "translate(0,0)")
			.attr("fill", function(r: any, i: string) { return String(getColor(i)); })
			.attr("opacity", "0.5");

		// create segment column for each level
		var planLayers = this.plan.selectAll(".plan-layer")
			.data(layers)
			.enter().append("g")
			.attr("class", "plan-layer")
			.style("fill", function(d: any, i: string) { return "url(#diagonalHatch" + i +")"; });

		// draw segment for each team
		this.planSegments = planLayers.selectAll(".plan-segment")
			.data(function(d: any) {return d; })
			.enter().append("rect")
			.attr("y", function(d: any) { return this.yScale(String(d.data.team)); }.bind(this))
			.attr("x", function(d: any) { return this.xScale(d[0]); }.bind(this))
			.attr("height", this.yScale.bandwidth())
			.attr("width", function(d: any) { return this.xScale(d[1]) - this.xScale(d[0]) }.bind(this));

		// draw bounding lines for each team
		this.bounds = this.svg.append("g")
			.attr("class", "bounds");

		var boundGroups = this.bounds.selectAll(".bounds-layer")
			.data(layers)
			.enter().append("g")
			.attr("class", "bounds-layer")
			.style("fill", function(d: any, i: string) { return String(getColor(i)); });

		boundGroups.selectAll("rect.plan-bound")
			.data(function(d: any) { return d; })
			.enter().append("rect")
			.attr("y", function(d: any) { return this.yScale(String(d.data.team)); }.bind(this))
			.attr("x", function(d: any) { return this.xScale(d[1]); }.bind(this))
			.attr("height", this.yScale.bandwidth())
			.attr("width", "3");

		// append y axis
		this.svg.append("g")
			.attr("class", "axis axis-y")
			.attr("transform", "translate(0,0)")
			.call(this.yAxis);  

		// append time axis
		this.timeline = this.svg.append("line")
			.attr("class", "timeline")
			.attr("x1", this.xScale(this.time)+2)
			.attr("y1", 0)
			.attr("x2", this.xScale(this.time)+2)
			.attr("y2", height)
			.attr("stroke-width", 3);

		// append time
		this.timeText = this.svg.append("text")
			.attr("class", "time")
			.attr("x", width-timeWidth)
			.attr("y", -20)
			.text(this.getTimeString(this.time));
	}

	drawData(config: any) {
		var d3 = this.d3,
			gamedata = config.data,
			icons = config.icons,
			colors = config.colors,
			getColor = d3.scaleOrdinal(colors);

		var stack = d3.stack()
			.keys(gamedata.keys)
			.offset(d3.stackOffsetNone);

		var layers = stack(gamedata.teams);

		this.time = config.time,

		this.gameDomain = d3.max(layers[layers.length - 1], function(d) { return d[1]; });

		// TODO rescale graph when needed (gameDomain > planDomain)
		if(!isNaN(this.gameDomain)) {
			this.xScale.domain([0, Math.max(this.planDomain, this.gameDomain)]);
		}

		// create segment column for each level
		var layer = this.svg.selectAll(".game-layer")
			.data(layers)
			.enter().append("g")
			.attr("class", "game-layer")
			.attr("fill", function(d: any, i: string) { return getColor(i); })

		// draw segment for each team
		var working: any = [];
		var xScale = this.xScale;
		var time = this.time;
		layer.selectAll("rect.game-segment")
			.data(function(d: any) { return d; })
			.enter().append("rect")
			.attr("y", function(d: any) { return this.yScale(d.data.team); }.bind(this))
			.attr("x", function(d: any) {
				return this.xScale(d[0]);
			}.bind(this))
			.attr("height", this.yScale.bandwidth())
			.attr("width", function(d: any, i: any) {
				// TODO better?
				if(isNaN(d[1])) {
					if(working[i]) {
						return 0;
					}
					else {
						working[i] = true;
						return xScale(time) - xScale(d[0]);
					}
				}
				else {
					var opacity = (d.data.level == 0) ? 0 : 0.3;
					d3.select(this).attr("class", "game-segment-finished")
						.attr("opacity", "0.3");
					return xScale(d[1]) - xScale(d[0]);
				}
			});

		// update time line
		 this.timeline.attr("x1", this.xScale(this.time)+2)
			 .attr("x2", this.xScale(this.time)+2);

		// update time
		this.timeText.text(this.getTimeString(this.time));

		// update plan according to actual data
		this.updatePlan(layers);

		// draw events
		var events = this.svg.append("g")
			.attr("class", "events");
		var eventLayers = events.selectAll("g.event-layer")
			.data(gamedata.teams)
			.enter().append("g");
		var yScale = this.yScale;
		eventLayers.selectAll("text.event")
			.data(function(d:any) { return d.events; })
			.enter().append("text")
			.attr("x", function(d: any) {
				// if solution or skip, shift the icon before the bounds of levels (to previous level)
				var x = this.xScale(d.time);
				if(d.type != "hint") {
					x -= this.yScale.bandwidth()*0.5;
				}
				return Math.max(0, x);
			}.bind(this))
			.attr("y", function() {
				var teamStruct: any = d3.select(this.parentNode).datum();
				return yScale(teamStruct.team) + yScale.bandwidth()*0.7;
			})
			.attr("fill", function(d: any) {
				return getColor(d.level);
			})
			.attr("font-family","FontAwesome")
			.attr('font-size', function(d: any) { return this.yScale.bandwidth()/2; }.bind(this) )
			.text(function(d: any) { return icons[d.type]; });

			// move bounds to top
		this.bounds.raise();
	}

	updatePlan(layersdata: any) {
		var d3 = this.d3;
		var offset: any = [];
		var working: any = [];
		var xScale = this.xScale;

		// move plan to top
		this.plan.raise();

		this.planSegments
			.attr("opacity", function(d: any, i: number) {
				var level: any = d3.select(this.parentNode).datum();
				var levelIndex = level.index,
					teamIndex = i,
					currentData = layersdata[levelIndex][teamIndex];
				if(isNaN(currentData[1])) {
					if(working[teamIndex]) { return 0; }
					else {
						working[teamIndex] = true;
						return 1;
					}  
				}
				else { return 0; }
			})
			.attr("x", function(d: any, i: number) {
				var level: any = d3.select(this.parentNode).datum();
				var levelIndex = level.index,
					teamIndex = i,
					currentData = layersdata[levelIndex][teamIndex],
					isCurrentLevel = isNaN(currentData[1]),
					x = d[0];
				if(isCurrentLevel) {
					offset[teamIndex] = currentData[0] - d[0];
					
				}
				
				if(offset[teamIndex] != undefined) {
					var shifted = x + offset[teamIndex];
					// if next level should start in past, must be shifted to present (as same as all next level)
					if(!isCurrentLevel && shifted < this.time) {
						offset[teamIndex] += (this.time - shifted);
						shifted = this.time;
					}
					x = shifted;
				}
				return xScale(Math.max(1,x));
			});
	}

	getTimeString(seconds: number) {
		var date = new Date(null);
			date.setSeconds(seconds);
			return date.toISOString().substr(11, 8)
	}

	getSeconds(timeString: string) {
		var s = timeString.split(':');
		return (+s[0]) * 3600 + (+s[1]) * 60 + (+s[2]); 
	}

}
