/**
 * @file
 *
 * Defines the {@link WaveformOverview} class.
 *
 * @module peaks/views/waveform.overview
 */

define([
  'peaks/views/playhead-layer',
  'peaks/views/points-layer',
  'peaks/views/segments-layer',
  'peaks/views/waveform-shape',
  'peaks/views/helpers/mousedraghandler',
  'peaks/waveform/waveform.axis',
  'peaks/waveform/waveform.utils',
  'konva'
], function(
  PlayheadLayer,
  PointsLayer,
  SegmentsLayer,
  WaveformShape,
  MouseDragHandler,
  WaveformAxis,
  Utils,
  Konva) {
  'use strict';

  /**
   * Creates the overview waveform view.
   *
   * @class
   * @alias WaveformOverview
   *
   * @param {WaveformData} waveformData
   * @param {HTMLElement} container
   * @param {Peaks} peaks
   */

  function WaveformOverview(waveformData, container, peaks) {
    var self = this;

    self.originalWaveformData = waveformData;
    self.container = container;
    self.peaks = peaks;

    self.options = peaks.options;

    self.width = container.clientWidth;
    self.height = container.clientHeight || self.options.height;

    if (self.width !== 0) {
      self.data = waveformData.resample(self.width);
    }
    else {
      self.data = waveformData;
    }

    self._resizeTimeoutId = null;

    self.stage = new Konva.Stage({
      container: container,
      width: self.width,
      height: self.height
    });

    self.waveformLayer = new Konva.FastLayer();

    self.axis = new WaveformAxis(self, self.waveformLayer);

    self.createWaveform();

    self._segmentsLayer = new SegmentsLayer(peaks, self, false);
    self._segmentsLayer.addToStage(self.stage);

    self._pointsLayer = new PointsLayer(peaks, self, false, false);
    self._pointsLayer.addToStage(self.stage);

    self._createHighlightLayer();

    self._playheadLayer = new PlayheadLayer(
      peaks,
      self,
      false, // showPlayheadTime
      self.options.mediaElement.currentTime
    );

    self._playheadLayer.addToStage(self.stage);

    self.mouseDragHandler = new MouseDragHandler(self.stage, {
      onMouseDown: function(mousePosX) {
        mousePosX = Utils.clamp(mousePosX, 0, self.width);

        var time = self.pixelsToTime(mousePosX);

        self._playheadLayer.updatePlayheadTime(time);

        self.peaks.player.seek(time);
      },

      onMouseMove: function(mousePosX) {
        mousePosX = Utils.clamp(mousePosX, 0, self.width);

        var time = self.pixelsToTime(mousePosX);

        // Update the playhead position. This gives a smoother visual update
        // than if we only use the player_time_update event.
        self._playheadLayer.updatePlayheadTime(time);

        self.peaks.player.seek(time);
      }
    });

    // Events

    self.peaks.on('player_play', function(time) {
      self._playheadLayer.updatePlayheadTime(time);
    });

    self.peaks.on('player_pause', function(time) {
      self._playheadLayer.stop(time);
    });

    peaks.on('player_time_update', function(time) {
      self._playheadLayer.updatePlayheadTime(time);
    });

    peaks.on('zoomview.displaying', function(startTime, endTime) {
      if (!self._highlightRect) {
        self._createHighlightRect(startTime, endTime);
      }

      self._updateHighlightRect(startTime, endTime);
    });

    peaks.on('window_resize', function() {
      if (self._resizeTimeoutId) {
        clearTimeout(self._resizeTimeoutId);
        self._resizeTimeoutId = null;
      }

      // Avoid resampling waveform data to zero width
      if (self.container.clientWidth !== 0) {
        self.width = self.container.clientWidth;
        self.stage.setWidth(self.width);

        self._resizeTimeoutId = setTimeout(function() {
          self.width = self.container.clientWidth;
          self.data = self.originalWaveformData.resample(self.width);
          self.stage.setWidth(self.width);

          self._updateWaveform();
        }, 500);
      }
    });
  }

  /**
   * Returns the pixel index for a given time, for the current zoom level.
   *
   * @param {Number} time Time, in seconds.
   * @returns {Number} Pixel index.
   */

  WaveformOverview.prototype.timeToPixels = function(time) {
    return Math.floor(time * this.data.adapter.sample_rate / this.data.adapter.scale);
  };

  /**
   * Returns the time for a given pixel index, for the current zoom level.
   *
   * @param {Number} pixels Pixel index.
   * @returns {Number} Time, in seconds.
   */

  WaveformOverview.prototype.pixelsToTime = function(pixels) {
    return pixels * this.data.adapter.scale / this.data.adapter.sample_rate;
  };

  /**
   * @returns {Number} The start position of the waveform shown in the view,
   *   in pixels.
   */

  WaveformOverview.prototype.getFrameOffset = function() {
    return 0;
  };

  /**
   * @returns {Number} The width of the view, in pixels.
   */

  WaveformOverview.prototype.getWidth = function() {
    return this.width;
  };

  /**
   * @returns {Number} The height of the view, in pixels.
   */

  WaveformOverview.prototype.getHeight = function() {
    return this.height;
  };

  /**
   * @returns {WaveformData} The view's waveform data.
   */

  WaveformOverview.prototype.getWaveformData = function() {
    return this.data;
  };

  /**
   * Creates a {WaveformShape} object that draws the waveform in the view,
   * and adds it to the wav
   */

  WaveformOverview.prototype.createWaveform = function() {
    this.waveformShape = new WaveformShape({
      color: this.options.overviewWaveformColor,
      view: this
    });

    this.waveformLayer.add(this.waveformShape);
    this.stage.add(this.waveformLayer);
  };

  WaveformOverview.prototype._createHighlightLayer = function() {
    this._highlightLayer = new Konva.FastLayer();
    this.stage.add(this._highlightLayer);
  };

  WaveformOverview.prototype._createHighlightRect = function(startTime, endTime) {
    this._highlightRectStartTime = startTime;
    this._highlightRectEndTime = endTime;

    var startOffset = this.timeToPixels(startTime);
    var endOffset   = this.timeToPixels(endTime);

    this._highlightRect = new Konva.Rect({
      startOffset: 0,
      y: 11,
      width: endOffset - startOffset,
      stroke: this.options.overviewHighlightRectangleColor,
      strokeWidth: 1,
      height: this.height - (11 * 2),
      fill: this.options.overviewHighlightRectangleColor,
      opacity: 0.3,
      cornerRadius: 2
    });

    this._highlightLayer.add(this._highlightRect);
  };

  /**
   * Updates the position of the highlight region.
   *
   * @param {Number} startTime The start of the highlight region, in seconds.
   * @param {Number} endTime The end of the highlight region, in seconds.
   */

  WaveformOverview.prototype._updateHighlightRect = function(startTime, endTime) {
    this._highlightRectStartTime = startTime;
    this._highlightRectEndTime = endTime;

    var startOffset = this.timeToPixels(startTime);
    var endOffset   = this.timeToPixels(endTime);

    this._highlightRect.setAttrs({
      x:     startOffset,
      width: endOffset - startOffset
    });

    this._highlightLayer.draw();
  };

  WaveformOverview.prototype._updateWaveform = function() {
    this.waveformLayer.draw();

    var playheadTime = this.peaks.player.getCurrentTime();

    this._playheadLayer.updatePlayheadTime(playheadTime);

    if (this._highlightRect) {
      this._updateHighlightRect(
        this._highlightRectStartTime,
        this._highlightRectEndTime
      );
    }

    var frameStartTime = 0;
    var frameEndTime   = this.pixelsToTime(this.width);

    this._pointsLayer.updatePoints(frameStartTime, frameEndTime);
    this._segmentsLayer.updateSegments(frameStartTime, frameEndTime);
  };

  WaveformOverview.prototype.destroy = function() {
    if (this._resizeTimeoutId) {
      clearTimeout(this._resizeTimeoutId);
      this._resizeTimeoutId = null;
    }

    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
    }
  };

  return WaveformOverview;
});
