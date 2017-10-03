import { Component, OnInit } from '@angular/core';
import { D3Service, D3, Axis, ScaleBand, ScaleLinear, ScaleOrdinal } from 'd3-ng2-service';
import { PapaParseService, PapaParseResult } from 'ngx-papaparse';
import {ViewEncapsulation} from '@angular/core';

type GenericObject = { [key: string]: any }
type NumericObject = { [key: number]: any }

interface CSVRow {
	datetime: string;
	event: string;
	level: string;
	uco: string;
	time: string;
}

interface DataEntry {
	team: string,
	event: string;
	level: number;
	time: number;
	timestamp: number;
}

interface Game {
	time: number;
	keys: string[];
	teams: GenericObject[];
}

interface Plan {
	keys: string[];
	teams: GenericObject[];
}

interface PlanConfig {
	data: Plan;
	element: string;
	colors: string[];
	time: number;
}

interface GameConfig {
	data: Game;
	colors: string[];
	icons: GenericObject;
	time: number;
}

interface Event {
	type: string;
	name: string;
	time: number;
	level: number;
}

interface Padding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

@Component({
	selector: 'app-game-analysis',
	templateUrl: './game-analysis.component.html',
	styleUrls: ['./game-analysis.component.css'],
	//TODO how to solve with encapsulation
	encapsulation: ViewEncapsulation.None
})
export class GameAnalysisComponent implements OnInit {

	private d3: D3;
	private papa: PapaParseService;
	private bounds: any;
	private xScale: ScaleLinear<number, number>;
	private yScale: ScaleBand<string>;
	private xAxis: Axis<number | { valueOf(): number }>;
	private yAxis: Axis<string>;
	private svg: any;
	private plan: any;
	private planDomain: number;
	private gameDomain: number;
	private planSegments: any;
	private time: number;
	private timeline: any;
	private timeText: any;
	private data: DataEntry[] = [];

	constructor(d3Service: D3Service, papa: PapaParseService) {
		this.d3 = d3Service.getD3();
		this.papa = papa;
	}

	ngOnInit(): void {
		this.loadData('assets/user_events_log1.csv');

		let fileIndex: number = 2;
		setInterval(function (): void {
			if (fileIndex <= 20) {
				this.loadData('assets/user_events_log'+fileIndex+'.csv');
				fileIndex++;
			}
		}.bind(this), 5000);
	}

	loadData(file: string): void {
		let startTime: number = 0;
		let index: number = 0;

		this.papa.parse(file, {
			download: true,
			header: true,
			step: function (row: PapaParseResult): void {
				let d: CSVRow = row.data[0],
					datetime: Date = new Date(d.datetime),
					timestamp: number = datetime.getTime()/1000;

				if ((index == 0) || (d.event == "Game started" && parseInt(d.level) == 1 && startTime > timestamp)) {
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

			complete: function (): void {
				this.applyData(startTime);
			}.bind(this)
		});
	}

	applyData(startTime: number): void {
		// TODO time plan for each level?
		let levelTimePlan: number = 1000;
		let gamedataset: GenericObject[] = [],
			plandataset: GenericObject[] = [],
			// stores levels keys for use in d3.stack, in format "level + index" or "start" for start of the game
			levels: string[] = ["start"],
			// to get the highest time as current time
			time: number =  0,
			// map for keys (team id) to game/plan datasets, because datasets must be arrays to use in d3.stack
			teamsMap: GenericObject = {},
			icons: GenericObject = { "hint" : "\uf111", "solution" : "\uf00c", "skip" : "\uf00d" },
			// level 0 transparent color, other modulo i (transparent exlude)
			gameColors: string[] = ["transparent", "#1c89b8", "#20ac4c", "#ff9d3c", "#fc5248"],
			// level 0 transparent color, other modulo i (transparent exlude)
			planColors: string[] = ["transparent", "#0e6f90", "#158136", "#ec7e26", "#d82f36"];

		this.data.forEach(function (d: DataEntry): void {
			let eventTime: number = Math.max(0, d.timestamp - startTime),
				levelKey: string = "level" + d.level,
				eventType: string = null,
				// delete possibly recorded higher levels from some previous game
				nextLevel: number = d.level+1;

			// if the team is not in dataset yet, it is added to game/plan datasets and map
			if (teamsMap[d.team] == null) {
				let teamIndex: number = gamedataset.length;
				teamsMap[d.team] = teamIndex;
				gamedataset[teamIndex] = {};
				gamedataset[teamIndex]["team"] = d.team;
				gamedataset[teamIndex]["events"] = [];

				plandataset[teamIndex] = {};
				plandataset[teamIndex]["team"] = d.team;
				plandataset[teamIndex]["start"] = 0;
			}

			// if there was some data from previous game, delete its events and levels
			if ((gamedataset[teamsMap[d.team]]["level" + nextLevel] != undefined)) {
				// finish of last level from previous game is considered as the start of new game
				// TODO - solve it as adding event to user log for every new game!
				let events: Event[] = gamedataset[teamsMap[d.team]]["events"],
					lastEvent: Event = events[events.length-1];		
				if(lastEvent != undefined) {
					let lastEventTime: number = lastEvent.time;
					gamedataset[teamsMap[d.team]]["start"] = lastEventTime;
				}
				
				gamedataset[teamsMap[d.team]]["events"] = [];
			}
			while ((gamedataset[teamsMap[d.team]]["level" + nextLevel] != undefined) && (nextLevel <= levels.length)) {
				delete gamedataset[teamsMap[d.team]]["level" + nextLevel];
				nextLevel++;
			}

			// add level to levels array, if it does not contain it yet
			if (levels.indexOf(levelKey)  == -1) levels.push(levelKey);

			if (time < d.timestamp) time = d.timestamp;

			// according to type of event, add it to events array of the team and/or store the time of level end
			switch (d.event) {
				case "Game started":
					// start at 0 time, not added to structure
					eventType = null;
					if (d.level == 1) {
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
					if (d.event.substr(0,4) == 'Hint')
						eventType = "hint";
					else eventType = null;
					break;
			}

			if (eventType != null) {
				let event: Event = {
					"type" : eventType,
					"name" : d.event,
					"time" : eventTime,
					"level" : d.level
				}
				gamedataset[teamsMap[d.team]]["events"].push(event);
			}	
		});

		plandataset.forEach(function (team: GenericObject): void {
			levels.forEach(function (level): void {
				team[level] = (level != "start") ? levelTimePlan : 0;
			});
		});
		

		let gamedata: Game = {
			"time" : time - startTime,
			"keys" : levels,
			"teams" : gamedataset
		}

		let plandata: Plan = {
			"keys" : levels,
			"teams" : plandataset
		}

		this.drawPlan({
			data: plandata,
			element: 'chart',
			colors: planColors,
			time: 0,
		});

		this.drawGame({
			data: gamedata,
			colors: gameColors,
			icons: icons,
			time: gamedata.time
		});

		let str = JSON.stringify(gamedata);
		console.log(str);
	}

	drawPlan(planConfig: PlanConfig): void {
		let d3: D3 = this.d3,
			element: string = planConfig.element,
			plandata: Plan = planConfig.data,
			padding: Padding = { top: 50, right: 20, bottom: 20, left: 80 },
			width: number = 1000 - padding.left - padding.right,
			height: number = 600 - padding.top - padding.bottom,
			timeWidth: number = 130,
			getColor: ScaleOrdinal<string, string> = d3.scaleOrdinal(planConfig.colors),
			// TODO type
			stack = d3.stack()
				.keys(plandata.keys)
				.offset(d3.stackOffsetNone),
			layers = stack(plandata.teams);

		this.time = planConfig.time;
		this.planDomain = d3.max(layers[layers.length - 1], function (d: number[]): number { return d[1]; }) + 500; //rezerva na přetečení;

		this.xScale = d3.scaleLinear().rangeRound([0, width]);
		this.yScale = d3.scaleBand().rangeRound([height, 0]).padding(0.02);
		this.xAxis = d3.axisBottom(this.xScale);
		this.yAxis = d3.axisLeft(this.yScale);
		d3.select("#" + element).html('');
		this.svg = d3.select("#" + element).append("svg")
				.attr("width", width + padding.left + padding.right)
				.attr("height", height + padding.top + padding.bottom)
				.append("g")
				.attr("transform", "translate(" + padding.left + "," + padding.top + ")");

		this.yScale.domain(plandata.teams.map(function(d: GenericObject): string { return d.team; }));
		this.xScale.domain([0, this.planDomain]);
		this.yScale.domain(plandata.teams.map(function (d: GenericObject): string { return d.team; }));

		this.plan = this.svg.append("g")
			.attr("class", "plan");

		// create hatched pattern defs
		let defs = this.plan.append("defs");
		let pattern = defs.selectAll("pattern")
			.data(plandata.keys)
			.enter().append("pattern")
			.attr("id", function (d: GenericObject, i: string): string { return "diagonalHatch"+i; })
			.attr("patternUnits", "userSpaceOnUse")
			.attr("width", "7")
			.attr("height", "4")
			.attr("patternTransform", "rotate(45)");
		pattern.append("rect")
			.attr("width", "3")
			.attr("height", "4")
			.attr("transform", "translate(0,0)")
			.attr("fill", function (r: GenericObject, i: string): string { return getColor(i); })
			.attr("opacity", "0.5");

		// create segment column for each level
		let planLayers = this.plan.selectAll(".plan-layer")
			.data(layers)
			.enter().append("g")
			.attr("class", "plan-layer")
			.style("fill", function (d: GenericObject, i: string): string { return "url(#diagonalHatch" + i +")"; });

		// draw segment for each team
		this.planSegments = planLayers.selectAll(".plan-segment")
			.data(function (d: GenericObject): GenericObject {return d; })
			.enter().append("rect")
			.attr("y", function (d: GenericObject): string { return this.yScale(String(d.data.team)); }.bind(this))
			.attr("x", function (d: GenericObject): string { return this.xScale(d[0]); }.bind(this))
			.attr("height", this.yScale.bandwidth())
			.attr("width", function (d: GenericObject): number { return this.xScale(d[1]) - this.xScale(d[0]) }.bind(this));

		// draw bounding lines for each team
		this.bounds = this.svg.append("g")
			.attr("class", "bounds");

		let boundGroups = this.bounds.selectAll(".bounds-layer")
			.data(layers)
			.enter().append("g")
			.attr("class", "bounds-layer")
			.style("fill", function (d: GenericObject, i: string): string { return getColor(i); });

		boundGroups.selectAll("rect.plan-bound")
			.data(function (d: GenericObject):GenericObject { return d; })
			.enter().append("rect")
			.attr("y", function (d: GenericObject): string { return this.yScale(String(d.data.team)); }.bind(this))
			.attr("x", function (d: GenericObject): string { return this.xScale(d[1]); }.bind(this))
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

	drawGame(gameConfig: GameConfig): void {
		let d3: D3 = this.d3,
			gamedata: Game = gameConfig.data,
			icons: GenericObject = gameConfig.icons,
			colors: string[] = gameConfig.colors,
			getColor: ScaleOrdinal<string, string> = d3.scaleOrdinal(colors),
			stack = d3.stack()
				.keys(gamedata.keys)
				.offset(d3.stackOffsetNone),
			layers = stack(gamedata.teams);

		this.time = gameConfig.time;

		this.gameDomain = d3.max(layers[layers.length - 1], function (d: number[]): number { return d[1]; });

		// TODO rescale graph when needed (gameDomain > planDomain)
		if (!isNaN(this.gameDomain)) {
			this.xScale.domain([0, Math.max(this.planDomain, this.gameDomain)]);
		}

		// create segment column for each level
		let layer = this.svg.selectAll(".game-layer")
			.data(layers)
			.enter().append("g")
			.attr("class", "game-layer")
			.attr("fill", function (d: GenericObject, i: string): string { return getColor(i); })

		// draw segment for each team
		let working: boolean[] = [];
		let xScale: ScaleLinear<number, number> = this.xScale;
		let time: number = this.time;
		layer.selectAll("rect.game-segment")
			.data(function (d: GenericObject): GenericObject { return d; })
			.enter().append("rect")
			.attr("y", function (d: GenericObject): string { return this.yScale(d.data.team); }.bind(this))
			.attr("x", function (d: GenericObject): string {
				return this.xScale(d[0]);
			}.bind(this))
			.attr("height", this.yScale.bandwidth())
			.attr("width", function (d: GenericObject, i: number) {
				// TODO better?
				if (isNaN(d[1])) {
					if (working[i]) {
						return 0;
					}
					else {
						working[i] = true;
						return xScale(time) - xScale(d[0]);
					}
				}
				else {
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
		let eventsLayer: any = this.svg.append("g")
			.attr("class", "events");

		let eventLayers: any = eventsLayer.selectAll("g.event-layer")
			.data(gamedata.teams)
			.enter().append("g");
		let yScale: ScaleBand<string> = this.yScale;
		eventLayers.selectAll("text.event")
			.data(function (d: GenericObject): Event[] { return d.events; })
			.enter().append("text")
			.attr("x", function (d: Event): number {
				// if solution or skip, shift the icon before the bounds of levels (to previous level)
				let x = this.xScale(d.time);
				if (d.type != "hint") {
					x -= this.yScale.bandwidth()*0.5;
				}
				return Math.max(0, x);
			}.bind(this))
			.attr("y", function (): number {
				let teamStruct: DataEntry = <DataEntry>d3.select(this.parentNode).datum();
				return yScale(teamStruct.team) + yScale.bandwidth()*0.7;
			})
			.attr("fill", function (d: GenericObject): string {
				return getColor(d.level);
			})
			.attr("font-family","FontAwesome")
			.attr('font-size', function (): number { return this.yScale.bandwidth()/2; }.bind(this) )
			.text(function (d: GenericObject): string { return icons[d.type]; });

		// move bounds to top
		this.bounds.raise();
	}

	updatePlan(layersdata: NumericObject): void {
		let d3: D3 = this.d3,
			offset: number[] = [],
			working: boolean[] = [],
			xScale: ScaleLinear<number, number> = this.xScale;

		// move plan to top
		this.plan.raise();

		this.planSegments
			.attr("opacity", function (d: GenericObject, i: number): number {
				let level: GenericObject = <GenericObject>d3.select(this.parentNode).datum(),
					levelIndex: number = level.index,
					teamIndex: number = i,
					currentData: NumericObject = layersdata[levelIndex][teamIndex];

				if (isNaN(currentData[1])) {
					if (working[teamIndex]) { return 0; }
					else {
						working[teamIndex] = true;
						return 1;
					}
				}
				else { return 0; }
			})
			.attr("x", function (d: any, i: number): number {
				let level: GenericObject = <GenericObject>d3.select(this.parentNode).datum(),
					levelIndex: number = level.index,
					teamIndex: number = i,
					currentData: NumericObject = layersdata[levelIndex][teamIndex],
					isCurrentLevel: boolean = isNaN(currentData[1]),
					x: number = d[0];

				if (isCurrentLevel) {
					offset[teamIndex] = currentData[0] - d[0];
					
				}
				
				if (offset[teamIndex] != undefined) {
					let shifted = x + offset[teamIndex];
					// if next level should start in past, must be shifted to present (as same as all next level)
					if (!isCurrentLevel && shifted < this.time) {
						offset[teamIndex] += (this.time - shifted);
						shifted = this.time;
					}
					x = shifted;
				}
				return xScale(Math.max(1,x));
			});
	}

	getTimeString(seconds: number): string {
		let date: Date = new Date();

		date.setSeconds(seconds);
		
		return date.toISOString().substr(11, 8)
	}

	getSeconds(timeString: string): number {
		let s: string[] = timeString.split(':');

		return (+s[0]) * 3600 + (+s[1]) * 60 + (+s[2]);
	}

}
