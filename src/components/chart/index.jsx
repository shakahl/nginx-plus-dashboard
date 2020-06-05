/**
 * Copyright 2017-present, Nginx, Inc.
 * Copyright 2017-present, Igor Meleschenko
 * All rights reserved.
 *
 */

import React from 'react';
import styles from './style.css';
import {
	getSetting,
	setSetting,
	subscribe,
	unsubscribe
} from '../../appsettings';
import { limitConnReqHistoryLimit } from '../../calculators/utils.js';

const chartDimensions = {
	width: 1150,
	height: 250,
	offsetTop: 70,
	offsetLeft: 50,
	offsetBottom: 30,
	offsetRight: 20,
	textOffset: 5,
	tickSize: 6
};
const TimeWindows = new Map([
	['1m', 60],
	['5m', 5 * 60],
	['15m', 15 * 60]
]);
const TimeWindowDefault = '5m';

export default class Chart extends React.Component {
	constructor(props){
		super(props);

		let selectedTimeWindow = getSetting('timeWindow');

		if (!selectedTimeWindow || !TimeWindows.has(selectedTimeWindow)) {
			selectedTimeWindow = TimeWindowDefault;
		}

		this.state = {
			disabledMetrics: [],
			highlightedMetric: null,
			mouseOffsetX: null,
			selectedTimeWindow,
			timeEnd: props.data.ts,
			dndIsInProgress: false,
			dndPointsIndicies: null
		};

		this.highlightMetricTimer = null;
		this.highlightedMetric = null;

		this.mouseOffsetX = null;
		this.mouseMoveTimer = null;

		this.dndStartX = 0;
		this.dndMoveX = 0;
		this.pointsIndicies = '0,0';

		this.drawCursorLine = this.drawCursorLine.bind(this);
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onMouseLeave = this.onMouseLeave.bind(this);
		this.onMouseDown = this.onMouseDown.bind(this);
		this.onMouseUp = this.onMouseUp.bind(this);
		this.redraw = this.redraw.bind(this);
		this.highlightMetric = this.highlightMetric.bind(this);

		this.redraw();
	}

	componentDidMount(){
		this.settingsListener = subscribe(value => {
			this.redraw({
				selectedTimeWindow: value,
				dndPointsIndicies: null
			});
		}, 'timeWindow');
	}

	componentWillUnmount(){
		unsubscribe(this.settingsListener);
	}

	componentWillReceiveProps(nextProps){
		const nextData = nextProps.data;
		const { data } = this.props;

		if (nextData.ts > data.ts) {
			const { dndPointsIndicies } = this.state;
			const nextState = {
				timeEnd: nextData.ts
			};

			if (
				dndPointsIndicies !== null &&
				nextData.data.length === limitConnReqHistoryLimit
			) {
				const updatingPeriod = parseInt(getSetting('updatingPeriod'), 10) / 1000;
				const indiciesShift = Math.round((nextData.ts - data.ts) / updatingPeriod);

				nextState.dndPointsIndicies = this.state.dndPointsIndicies
					.split(',')
					.reduce((memo, index, i, initialIndicies) => {
						const reducedIndex = index - indiciesShift;

						if (memo === '') {
							return reducedIndex > 0 ? `${ reducedIndex }` : '0';
						} else {
							if (memo === '0') {
								return `${ memo },${ index - initialIndicies[0] }`;
							} else {
								return `${ memo },${ reducedIndex }`;
							}
						}
					}, '');
			}

			this.redraw(nextState, nextProps);
		}
	}

	shouldComponentUpdate(nextProps, nextState){
		if (this.state.dndIsInProgress) {
			return this.state.dndPointsIndicies !== nextState.dndPointsIndicies;
		} else return true;
	}

	onMouseLeave(){
		if (this.mouseMoveTimer !== null) {
			clearTimeout(this.mouseMoveTimer);
			this.mouseMoveTimer = null;
		}

		this.setState({
			mouseOffsetX: null,
			dndIsInProgress: false
		});
	}

	drawCursorLine(){
		if (!this.state.dndIsInProgress) {
			this.setState({ mouseOffsetX: this.mouseOffsetX });
		}
	}

	onMouseDown(evt){
		this.dndStartX = evt.offsetX;
		this.dndMoveX = evt.offsetX;

		const nextState = {
			dndIsInProgress: true,
			mouseOffsetX: null
		};

		if (this.state.dndPointsIndicies === null) {
			nextState.dndPointsIndicies = this.pointsIndicies;
		}

		this.redraw(nextState);
	}

	onMouseUp(){
		const nextState = {
			dndIsInProgress: false
		};

		if (
			this.state.dndPointsIndicies !== null &&
			this.state.dndPointsIndicies.includes(`${ this.props.data.data.length - 1 }`)
		) {
			nextState.dndPointsIndicies = null;
		}

		this.redraw(nextState);
	}

	onMouseMove(evt){
		const { offsetX } = evt;

		if (this.state.dndIsInProgress) {
			if (Math.abs(this.dndStartX - offsetX) < Math.abs(this.dndStartX - this.dndMoveX)) {
				this.dndStartX = offsetX;
				this.dndMoveX = offsetX;
			} else {
				this.dndMoveX = offsetX;

				const { data: { data } } = this.props;
				const dndPointsIndicies = this.state.dndPointsIndicies.split(',');
				let k;

				switch(this.state.selectedTimeWindow){
					case '1m':
						k = 20;
						break;

					case '5m':
						k = 10;
						break;

					case '15m':
						k = 5;
						break;
				}


				const path = (offsetX < this.dndStartX ? -1 : 1) * Math.floor(Math.abs(offsetX - this.dndStartX) / k);

				if (path !== 0) {
					const maxIndex = data.length - 1;

					this.dndStartX += path * 20;

					if (
						path > 0 && dndPointsIndicies[0] > 0 ||
						path < 0 && dndPointsIndicies[1] < maxIndex
					) {
						this.redraw({
							dndPointsIndicies: dndPointsIndicies.reduce(
								(memo, index, i, initialIndicies) => {
									const changedIndex = index - path;

									if (memo === '') {
										return changedIndex > 0 ? `${ changedIndex }` : '0';
									} else {
										if (memo === '0') {
											return `${ memo },${ index - initialIndicies[0] }`;
										} else if (changedIndex > maxIndex) {
											const pathOverflow = changedIndex - maxIndex;

											return `${ memo - pathOverflow },${ maxIndex }`;
										} else {
											return `${ memo },${ changedIndex }`;
										}
									}
								}, ''
							)
						});
					}
				}
			}
		} else {
			this.mouseOffsetX = chartDimensions.offsetLeft + offsetX;

			if (this.mouseMoveTimer === null) {
				this.mouseMoveTimer = setTimeout(() => {
					this.drawCursorLine();

					this.mouseMoveTimer = null;
				}, 100);
			}
		}
	}

	emulateDnd(direction, toBorder){
		const { data: { data } } = this.props;
		const { dndPointsIndicies } = this.state;
		const pointsIndicies = (
				dndPointsIndicies !== null ? dndPointsIndicies : this.pointsIndicies
			).split(',').map(i => parseInt(i, 10));
		const indiciesDiff = pointsIndicies[1] - pointsIndicies[0];
		let nextDndPointsIndicies;

		if (
			!toBorder && (
				direction > 0 && data.length - 1 - pointsIndicies[1] <= indiciesDiff ||
				direction < 0 && pointsIndicies[0] <= indiciesDiff
			)
		) {
			toBorder = true;
		}

		if (toBorder) {
			if (direction > 0) {
				nextDndPointsIndicies = null;
			} else {
				nextDndPointsIndicies = `0,${ indiciesDiff }`;
			}
		} else {
			nextDndPointsIndicies = `${ pointsIndicies[0] + direction * indiciesDiff },${ pointsIndicies[1] + direction * indiciesDiff }`;
		}

		this.redraw({
			dndPointsIndicies: nextDndPointsIndicies
		});
	}

	deferredHighlightMetric(metric){
		this.highlightedMetric = metric;

		if (this.highlightMetricTimer === null) {
			this.highlightMetricTimer = setTimeout(
				this.highlightMetric,
				200
			);
		}
	}

	highlightMetric(){
		this.highlightMetricTimer = null;

		if (this.highlightedMetric !== this.state.highlightedMetric) {
			this.redraw({
				highlightedMetric: this.highlightedMetric
			});
		}
	}

	toggleMetric(name){
		const { disabledMetrics } = this.state;

		this.redraw({
			disabledMetrics: disabledMetrics.includes(name) ?
					disabledMetrics.filter(metric => metric !== name)
				: disabledMetrics.concat(name),
			highlightedMetric: null
		});
	}

	redraw(nextState = {}, nextProps){
		const {
			colors,
			labels,
			data: { data }
		} = nextProps ? nextProps : this.props;
		const {
			disabledMetrics,
			highlightedMetric,
			selectedTimeWindow,
			timeEnd,
			dndPointsIndicies
		} = Object.assign({}, this.state, nextState);
		const {
			width, height,
			offsetLeft, offsetTop, offsetBottom, offsetRight,
			textOffset, tickSize
		} = chartDimensions;

		this.ticks = [];
		this.points = [];
		this.toRender = {
			yMax: null,
			yMid: null,
			charts: [],
			areas: [],
			legend: [],
			tooltipPoints: []
		};
		this.dndAllowed = false;

		const updatingPeriod = parseInt(getSetting('updatingPeriod'), 10) / 1000;
		const chartWidth = width - offsetLeft - offsetRight;
		const chartHeight = height - offsetTop - offsetBottom;
		let timeDiff = TimeWindows.get(selectedTimeWindow) + 0.2 * updatingPeriod;
		let timeStart = timeEnd - timeDiff;
		let xStep = null;

		if (data.length > 0) {
			const firstPointIndex = data.findIndex(point => point._ts >= timeStart);

			if (firstPointIndex >= 0) {
				if (firstPointIndex > 0) {
					this.dndAllowed = true;

					if (data[firstPointIndex]._ts - timeStart < 2 * updatingPeriod) {
						timeStart = data[firstPointIndex]._ts;
						timeDiff = timeEnd - timeStart;
					}
				}

				let parsedData;

				if (dndPointsIndicies) {
					parsedData = data.slice(...dndPointsIndicies.split(','));
					timeStart = parsedData[0]._ts;
					timeDiff = parsedData[parsedData.length - 1]._ts - timeStart;
				} else {
					parsedData = data.slice(firstPointIndex);
				}

				const metrics = Array.from(colors.keys());

				xStep = chartWidth / timeDiff;

				let yMax = parsedData.reduce((max, { zone }) => {
					const newMax = metrics.reduce((memo, key) => {
						if (key in zone && !disabledMetrics.includes(key)) {
							memo += zone[key];
						}

						return memo;
					}, 0);

					return newMax > max ? newMax : max;
				}, 0);

				if (yMax > 0) {
					if (yMax % 2 === 1) {
						yMax += 1;
					}

					this.toRender.yMax = [
						<text
							key="y-max-label"
							styleName="y-label"
							x={ offsetLeft - textOffset }
							y={ offsetTop }
						>{ yMax }</text>,
						<line
							key="y-max-line"
							styleName="x-line"
							x1={ offsetLeft }
							x2={ offsetLeft + chartWidth }
							y1={ offsetTop }
							y2={ offsetTop }
						/>
					];

					const yMidCoord = offsetTop + chartHeight / 2;

					this.toRender.yMid = [
						<text
							key="y-mid-label"
							styleName="y-label"
							x={ offsetLeft - textOffset }
							y={ yMidCoord }
						>{ yMax / 2 }</text>,
						<line
							key="y-mid-line"
							styleName="x-line"
							x1={ offsetLeft }
							x2={ offsetLeft + chartWidth }
							y1={ yMidCoord }
							y2={ yMidCoord }
						/>
					];
				}

				const yStep = yMax > 0 ? (chartHeight / yMax) : 0;
				const charts = {};

				parsedData.forEach((point, i) => {
					const x = offsetLeft + (point._ts - timeStart) * xStep;
					const values = {};
					let valuesStack = 0;

					for (let j = metrics.length - 1; j >= 0; j--) {
						const key = metrics[j];

						if (!disabledMetrics.includes(key)) {
							const value = point.zone[key];
							const y = offsetTop + chartHeight - yStep * (value + valuesStack);

							if (i === 0) {
								charts[key] = {
									path: `M ${ x } ${ y }`,
									coordinates: [[x, y]]
								};
							} else {
								charts[key].path += ` L ${ x } ${ y }`;
								charts[key].coordinates.push([x, y]);
							}

							valuesStack += value;
							values[key] = value;
						}
					}

					this.points.push({
						x,
						values,
						_ts: point._ts
					});
				});

				for (let i = metrics.length - 1; i >= 0; i--) {
					const key = metrics[i];

					if (key in charts) {
						const isFaded = highlightedMetric !== null && highlightedMetric !== key;

						this.toRender.charts.push(
							<path
								key={ `chart_${ key }` }
								styleName={ `line ${ isFaded ? 'faded' : '' }` }
								style={{ stroke: colors.get(key) }}
								d={ charts[key].path }
							/>
						);

						let prevKey = null;

						if (i < metrics.length - 1) {
							let j = i + 1;

							while (j < metrics.length && prevKey === null) {
								if (disabledMetrics.includes(metrics[j])) {
									j++;
								} else {
									prevKey = metrics[j];
								}
							}
						}

						if (prevKey === null) {
							this.toRender.areas.push(
								<path
									key={ `chart-area_${ key }` }
									styleName={ `area ${ isFaded ? 'faded' : '' }` }
									style={{ fill: colors.get(key) }}
									d={ `${ charts[key].path } V ${ offsetTop + chartHeight } H ${ charts[key].coordinates[0][0] } V ${ charts[key].coordinates[0][1] }` }
								/>
							);
						} else {
							const prevChart = charts[prevKey];

							this.toRender.areas.push(
								<path
									key={ `chart-area_${ key }` }
									styleName={ `area ${ isFaded ? 'faded' : '' }` }
									style={{ fill: colors.get(key) }}
									d={ `${ charts[key].path } V ${ prevChart.coordinates[prevChart.coordinates.length - 1][1] }${ prevChart.coordinates.reduce((memo, [x, y]) => `L ${ x } ${ y } ${ memo }`, '') } V ${ prevChart.coordinates[0][1] }` }
								/>
							);
						}
					}

					const reversedKey = metrics[metrics.length - 1 - i];
					let legendItemStyleName = 'legend__item';
					let isDisabled = disabledMetrics.includes(reversedKey);

					if (isDisabled) {
						legendItemStyleName += ' legend__item_disabled';
					}

					this.toRender.legend.push(
						<span
							key={ `legend_${ reversedKey }` }
							styleName={ legendItemStyleName }
							onClick={ this.toggleMetric.bind(this, reversedKey) }
							onMouseOver={ isDisabled ? null : this.deferredHighlightMetric.bind(this, reversedKey) }
							onMouseLeave={ isDisabled ? null : this.deferredHighlightMetric.bind(this, null) }
						>
							<span
								styleName="legend__color"
								style={{ background: colors.get(reversedKey) }}
							/>
							{ labels.has(reversedKey) ? labels.get(reversedKey) : reversedKey }
						</span>
					);
				}
			}

			this.pointsIndicies = `${ firstPointIndex },${ data.length - 1 }`;
		}

		if (xStep !== null) {
			let ticksStep;

			switch(selectedTimeWindow){
				case '1m':
					ticksStep = 10;
					break;

				case '5m':
					ticksStep = 60;
					break;

				case '15m':
					ticksStep = 180;
					break;
			}

			const _timeEnd = timeStart + timeDiff;
			let currentTick = Math.ceil(timeStart / ticksStep) * ticksStep;

			while (currentTick <= _timeEnd) {
				this.ticks.push({
					x: offsetLeft + (currentTick - timeStart) * xStep,
					y: height - offsetBottom + 3 * tickSize,
					label: new Date(currentTick * 1000).toLocaleString('en-US', {
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit',
						hour12: false
					})
				});

				currentTick += ticksStep;
			}
		}

		this.timeWindowControls = [];

		TimeWindows.forEach((tw, key) => {
			let styleName = 'timewindow__item';
			let onClick = null;

			if (key === selectedTimeWindow) {
				styleName += ' timewindow__item_selected';
			} else {
				onClick = () => setSetting('timeWindow', key);
			}

			this.timeWindowControls.push(
				<div
					key={ key }
					styleName={ styleName }
					onClick={ onClick }
				>{ key }</div>
			);
		});

		let backDndAllowed = false;
		let forwardDndAllowed = false;

		if (this.dndAllowed) {
			const pointsIndicies = (
					dndPointsIndicies !== null ? dndPointsIndicies : this.pointsIndicies
				).split(',');

			if (pointsIndicies[0] > 0) {
				backDndAllowed = true;
			}

			if (pointsIndicies[1] < data.length - 1) {
				forwardDndAllowed = true;
			}
		}

		this.dndControls = [
			<div
				key={ 0 }
				styleName={ `dnd-controls__control ${ backDndAllowed ? '' : 'dnd-controls__control_disabled' }` }
				title="Click to view the oldest data"
				onClick={ backDndAllowed ? this.emulateDnd.bind(this, -1, true) : null }
			>&#171;</div>,
			<div
				key={ 1 }
				styleName={ `dnd-controls__control ${ backDndAllowed ? '' : 'dnd-controls__control_disabled' }` }
				title={ `Click to go back for ${ selectedTimeWindow }` }
				onClick={ backDndAllowed ? this.emulateDnd.bind(this, -1, false) : null }
			>&#8249;</div>,
			<div
				key={ 2 }
				styleName={ `dnd-controls__control ${ forwardDndAllowed ? '' : 'dnd-controls__control_disabled' }` }
				title={ `Click to go forward for ${ selectedTimeWindow }` }
				onClick={ forwardDndAllowed ? this.emulateDnd.bind(this, 1, false) : null }
			>&#8250;</div>,
			<div
				key={ 3 }
				styleName={ `dnd-controls__control ${ forwardDndAllowed ? '' : 'dnd-controls__control_disabled' }` }
				title="Click to return to live mode"
				onClick={ forwardDndAllowed ? this.emulateDnd.bind(this, 1, true) : null }
			>&#187;</div>
		];

		if (Object.keys(nextState).length > 0) {
			this.setState(nextState);
		}
	}

	render(){
		const { colors, labels } = this.props;
		const {
			mouseOffsetX,
			dndIsInProgress,
			dndPointsIndicies
		} = this.state;
		const {
			width, height,
			offsetLeft, offsetTop, offsetBottom, offsetRight,
			textOffset, tickSize
		} = chartDimensions;
		const chartWidth = width - offsetLeft - offsetRight;
		const chartHeight = height - offsetTop - offsetBottom;
		const xAxisY = height - offsetBottom;

		let activePoint;
		let cursorLineTransform = null;

		if (mouseOffsetX !== null) {
			for (let i = 0; i < this.points.length; i++) {
				const point = this.points[i];

				if (point.x === mouseOffsetX) {
					activePoint = point;

					break;
				} else if (point.x > mouseOffsetX) {
					const prevPoint = this.points[i - 1];

					if (
						!prevPoint ||
						point.x - mouseOffsetX <= mouseOffsetX - prevPoint.x
					) {
						activePoint = point;
					} else {
						activePoint = prevPoint;
					}

					break;
				}
			}
		}

		let mouseTrackerClass = `mouse-tracker${ this.dndAllowed ? ' mouse-tracker_drag' : '' }`;

		if (dndIsInProgress) {
			mouseTrackerClass += ' mouse-tracker_dragging';
		} else if (activePoint) {
			this.toRender.tooltipPoints = [];
			colors.forEach((color, key) => {
				if (key in activePoint.values) {
					this.toRender.tooltipPoints.push(
						<div
							key={ `tooltip_${ key }` }
							styleName="tooltip__point"
						>
							<div
								styleName="tooltip__value"
								style={{ color }}
							>{ activePoint.values[key] }</div>
							<div styleName="tooltip__metric">{ labels.has(key) ? labels.get(key) : key }</div>
						</div>
					);
				}
			});

			cursorLineTransform = `translate(${ activePoint.x })`;
		}

		return (
			<div styleName="container">
				<div styleName="dnd-controls">{ this.dndControls }</div>
				<div styleName="timewindow">{ this.timeWindowControls }</div>

				{
					activePoint ?
						<div
							styleName="tooltip"
							style={ activePoint.x > chartWidth / 2 ? {
								right: `${ width - activePoint.x + 8 }px`
							} : {
								left: `${ activePoint.x + 8 }px`
							}}
						>
							{ this.toRender.tooltipPoints }

							<div
								key="tooltip__time"
								styleName="tooltip__time"
							>{
								new Date(activePoint._ts * 1000).toLocaleString('en-US', {
									hour: '2-digit',
									minute: '2-digit',
									second: '2-digit',
									hour12: false
								})
							}</div>
						</div>
					: null
				}

				<div
					styleName={ mouseTrackerClass }
					style={{
						width: `${ chartWidth }px`,
						height: `${ chartHeight }px`,
						top: `${ offsetTop }px`,
						left: `${ offsetLeft }px`
					}}
					onMouseMove={ this.onMouseMove }
					onMouseLeave={ this.onMouseLeave }
					onMouseDown={ this.dndAllowed ? this.onMouseDown : null }
					onMouseUp={ this.dndAllowed ? this.onMouseUp : null }
				/>

				<svg
					version="1.1"
					baseProfile="full"
					width={ `${ width }` }
					height={ `${ height }` }
					xmlns="http://www.w3.org/2000/svg"
					styleName="svg"
				>
					<path
						styleName="x-axis"
						d={ this.ticks.reduce((memo, tick) => {
							return `${ memo }${ memo ? '' : ' ' }M ${ tick.x } ${ xAxisY } V ${ xAxisY + tickSize }`;
						}, '') }
					/>
					<text
						styleName="y-label"
						x={ offsetLeft - textOffset }
						y={ height - offsetBottom }
					>0</text>
					<line
						styleName="x-axis"
						x1={ offsetLeft }
						x2={ offsetLeft + chartWidth }
						y1={ xAxisY }
						y2={ xAxisY }
					/>
					<line
						styleName="cursor-line"
						x1="0"
						x2="0"
						y1={ offsetTop - 10 }
						y2={ offsetTop + chartHeight + 6 }
						transform={ cursorLineTransform }
						style={{
							opacity: activePoint ? 1 : 0
						}}
					/>

					{ this.ticks.map(({ x, y, label }, i) =>
						<text
							key={ i }
							styleName="x-label"
							x={ x }
							y={ y }
						>{ label }</text>
					) }

					{ this.toRender.yMax }
					{ this.toRender.yMid }
					{ this.toRender.charts }
					{ this.toRender.areas }
				</svg>
				<div styleName="legend">{ this.toRender.legend }</div>
			</div>
		);
	}
};

Chart.defaultProps = {
	labels: new Map()
};
