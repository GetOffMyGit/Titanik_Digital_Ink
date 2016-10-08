(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module unless amdModuleId is set
    define([], function () {
      return (root['DrawingPad'] = factory());
    });
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    root['DrawingPad'] = factory();
  }
}(this, function () {

/*!
 * Modified from:
 * Signature Pad v1.5.3
 * https://github.com/szimek/signature_pad
 *
 * Copyright 2016 Szymon Nowak
 * Released under the MIT license
 *
 * The main idea and some parts of the code (e.g. drawing variable width Bézier curve) are taken from:
 * http://corner.squareup.com/2012/07/smoother-signatures.html
 *
 * Implementation of interpolation using cubic Bézier curves is taken from:
 * http://benknowscode.wordpress.com/2012/09/14/path-interpolation-using-cubic-bezier-and-control-point-estimation-in-javascript
 *
 * Algorithm for approximated length of a Bézier curve is taken from:
 * http://www.lemoda.net/maths/bezier-length/index.html
 *
 */
var DrawingPad = (function (document) {
    "use strict";

    const drawModes = {
        PEN: 0,
        CIRCLE: 1,
        SQUARE: 2,
        TRIANGLE: 3
    };

    var DrawingPad = function (canvas, options) {
        var self = this,
            opts = options || {};

        this.velocityFilterWeight = opts.velocityFilterWeight || 0.7;
        this.minWidth = opts.minWidth || 0.5;
        this.maxWidth = opts.maxWidth || 2.5;
        this.dotSize = opts.dotSize || function () {
            return (this.minWidth + this.maxWidth) / 2;
        };
        this.penColor = opts.penColor || "black";
        this.selectedColor = "yellow";
        this.backgroundColor = opts.backgroundColor || "rgba(0,0,0,0)";
        // how close the user must touch to a line to actually select it
        this.distanceThreshold = 20;  
        this.onEnd = opts.onEnd;
        this.onBegin = opts.onBegin;
        this.inkLines = [];
		this.undoStack = [];
        this.listOfShapes = [];
        this.drawMode = drawModes.PEN;
        // holds the lines currently selected by the user
        this.selectedLines = [];
        // used to determine if double tap or single tap
        this.touchTimer = null;

        this._canvas = canvas;
        this._ctx = canvas.getContext("2d");
        this.clear();

        // we need add these inline so they are available to unbind while still having
        //  access to 'self' we could use _.bind but it's not worth adding a dependency
        this._handleMouseDown = function (event) {
            if (event.which === 1) {
                self._mouseButtonDown = true;

                // handle depending on selected mode
                self._startShapeOrLine(event);
            }
        };

        this._handleMouseMove = function (event) {
            if (self._mouseButtonDown) {

                // handle depending on selected mode
                self._updateShapeOrLineOnMove(event);
            }
        };

        this._handleMouseUp = function (event) {
            if (event.which === 1 && self._mouseButtonDown) {
                self._mouseButtonDown = false;

                // handle depending on selected mode
                self._endShaopeOrLine(event);
            }
        };

        this._handleTouchStart = function (event) {
             var touch = event.changedTouches[0];
             
            // if single finger used in touch
            if (event.targetTouches.length == 1) {
                    var context = this;
                    // if user does not tap again in timeout time limit then it is a single tap
                    if (this.touchTimer == null) {
                        this.touchTimer = setTimeout(function () {
                            context.touchTimer = null;
                            var touch = event.changedTouches[0];
                            // handle depending on selected mode
                            self._startShapeOrLine(touch);
                        }, 500)
                    // otherwise it is a double tap
                    } else {                
                        // get line selected by user and highlight it
                        var touch = event.targetTouches[0];
                        self.selectLine(touch);
                        self.highlightSelectedLines();
                        // reset touch timer  
                        clearTimeout(context.touchTimer);
                        context.touchTimer = null;
                    }                
            // //}	else if (event.targetTouches.length == 2) {
			// //	swal("Two fingers detected!")
			 }
        };

        this._handleTouchMove = function (event) {
            // Prevent scrolling.
            event.preventDefault();
            // if user is dragging their finger, check if they are drawing (single tap)
            if (this.touchTimer != null) {
                // if they are drawing after a single tap, kill the timeout callback so another stroke is not drawn
                clearTimeout(this.touchTimer);
                this.touchTimer = null;
                // reset drawing pad variables so newly drawn line is NOT continued from previously drawn line
                self._reset();
            }
            var touch = event.targetTouches[0];
            // handle depending on selected mode
            self._updateShapeOrLineOnMove(touch);
        };

        this._handleTouchEnd = function (event) {
            var wasCanvasTouched = event.target === self._canvas;
            if (wasCanvasTouched) {
                event.preventDefault();

                // handle depending on selected mode
                self._endShaopeOrLine(event);
            }
        };

        this._handleMouseEvents();
        this._handleTouchEvents();
    };

    DrawingPad.prototype.clear = function () {
        var ctx = this._ctx,
            canvas = this._canvas;

        ctx.fillStyle = this.backgroundColor;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this._reset();
    };
	
	DrawingPad.prototype.clearStack = function () {
		this.undoStack = [];
		this.inkLines = [];
	}

    DrawingPad.prototype.toDataURL = function (imageType, quality) {
        var canvas = this._canvas;
        return canvas.toDataURL.apply(canvas, arguments);
    };

    DrawingPad.prototype.fromDataURL = function (dataUrl) {
        var self = this,
            image = new Image(),
            ratio = window.devicePixelRatio || 1,
            width = this._canvas.width / ratio,
            height = this._canvas.height / ratio;

        this._reset();
        image.src = dataUrl;
        image.onload = function () {
            self._ctx.drawImage(image, 0, 0, width, height);
        };
        this._isEmpty = false;
    };

    DrawingPad.prototype._strokeUpdate = function (event) {
        var point = this._createPoint(event);
        this._addPoint(point);
    };

    DrawingPad.prototype._strokeBegin = function (event) {
        this._reset();
        this._strokeUpdate(event);
        if (typeof this.onBegin === 'function') {
            this.onBegin(event);
        }
    };

    DrawingPad.prototype._strokeDraw = function (point) {
        var ctx = this._ctx,
            dotSize = typeof(this.dotSize) === 'function' ? this.dotSize() : this.dotSize;

        ctx.beginPath();
        this._drawPoint(point.x, point.y, dotSize);
        ctx.closePath();
        ctx.fill();
    };

    DrawingPad.prototype._strokeEnd = function (event) {
        var canDrawCurve = this.points.length > 2,
            point = this.points[0];

        // save to local storage
        this.inkLines.push(this.inkLine);
        this.listOfShapes.push(this.inkLine);

        localStorage.setItem('line', JSON.stringify(this.inkLines));

        if (!canDrawCurve && point) {
            this._strokeDraw(point);
        }
        if (typeof this.onEnd === 'function') {
            this.onEnd(event);
        }
    };

    DrawingPad.prototype._handleMouseEvents = function () {
        this._mouseButtonDown = false;

        this._canvas.addEventListener("mousedown", this._handleMouseDown);
        this._canvas.addEventListener("mousemove", this._handleMouseMove);
        document.addEventListener("mouseup", this._handleMouseUp);
    };

    DrawingPad.prototype._handleTouchEvents = function () {
        // Pass touch events to canvas element on mobile IE11 and Edge.
        this._canvas.style.msTouchAction = 'none';
        this._canvas.style.touchAction = 'none';

        this._canvas.addEventListener("touchstart", this._handleTouchStart);
        this._canvas.addEventListener("touchmove", this._handleTouchMove);
        this._canvas.addEventListener("touchend", this._handleTouchEnd);
    };

    DrawingPad.prototype.on = function () {
        this._handleMouseEvents();
        this._handleTouchEvents();
    };

    DrawingPad.prototype.off = function () {
        this._canvas.removeEventListener("mousedown", this._handleMouseDown);
        this._canvas.removeEventListener("mousemove", this._handleMouseMove);
        document.removeEventListener("mouseup", this._handleMouseUp);

        this._canvas.removeEventListener("touchstart", this._handleTouchStart);
        this._canvas.removeEventListener("touchmove", this._handleTouchMove);
        this._canvas.removeEventListener("touchend", this._handleTouchEnd);
    };

    DrawingPad.prototype.isEmpty = function () {
        return this._isEmpty;
    };

    DrawingPad.prototype._reset = function (lineColor) {
        // if different colour passed for line, use that instead of default pen color
        var colorToUse = lineColor || this.penColor;

        this.points = [];
        this._lastVelocity = 0;
        this._lastWidth = (this.minWidth + this.maxWidth) / 2;
        this._isEmpty = true;
        this._ctx.fillStyle = colorToUse;
        this.inkLine = new InkLine(this.penColor);
    };

    DrawingPad.prototype._createPoint = function (event) {
        var rect = this._canvas.getBoundingClientRect();
        return new Point(
            event.clientX - rect.left,
            event.clientY - rect.top
        );
    };

    DrawingPad.prototype._addPoint = function (point) {
        var points = this.points,
            c2, c3,
            curve, tmp;

        points.push(point);
        this.inkLine._addPointToLine(point);

        if (points.length > 2) {
            // To reduce the initial lag make it work with 3 points
            // by copying the first point to the beginning.
            if (points.length === 3) points.unshift(points[0]);

            tmp = this._calculateCurveControlPoints(points[0], points[1], points[2]);
            c2 = tmp.c2;
            tmp = this._calculateCurveControlPoints(points[1], points[2], points[3]);
            c3 = tmp.c1;
            curve = new Bezier(points[1], c2, c3, points[2]);
            this._addCurve(curve);

            // Remove the first element from the list,
            // so that we always have no more than 4 points in points array.
            points.shift();
        }
    };

    DrawingPad.prototype._calculateCurveControlPoints = function (s1, s2, s3) {
        var dx1 = s1.x - s2.x, dy1 = s1.y - s2.y,
            dx2 = s2.x - s3.x, dy2 = s2.y - s3.y,

            m1 = {x: (s1.x + s2.x) / 2.0, y: (s1.y + s2.y) / 2.0},
            m2 = {x: (s2.x + s3.x) / 2.0, y: (s2.y + s3.y) / 2.0},

            l1 = Math.sqrt(dx1*dx1 + dy1*dy1),
            l2 = Math.sqrt(dx2*dx2 + dy2*dy2),

            dxm = (m1.x - m2.x),
            dym = (m1.y - m2.y),

            k = l2 / (l1 + l2),
            cm = {x: m2.x + dxm*k, y: m2.y + dym*k},

            tx = s2.x - cm.x,
            ty = s2.y - cm.y;

        return {
            c1: new Point(m1.x + tx, m1.y + ty),
            c2: new Point(m2.x + tx, m2.y + ty)
        };
    };

    DrawingPad.prototype._addCurve = function (curve) {
        var startPoint = curve.startPoint,
            endPoint = curve.endPoint,
            velocity, newWidth;

        velocity = endPoint.velocityFrom(startPoint);
        velocity = this.velocityFilterWeight * velocity
            + (1 - this.velocityFilterWeight) * this._lastVelocity;

        newWidth = this._strokeWidth(velocity);
        this._drawCurve(curve, this._lastWidth, newWidth);

        this._lastVelocity = velocity;
        this._lastWidth = newWidth;
    };

    DrawingPad.prototype._drawPoint = function (x, y, size) {
        var ctx = this._ctx;

        ctx.moveTo(x, y);
        ctx.arc(x, y, size, 0, 2 * Math.PI, false);
        this._isEmpty = false;
    };

    DrawingPad.prototype._drawCurve = function (curve, startWidth, endWidth) {
        var ctx = this._ctx,
            widthDelta = endWidth - startWidth,
            drawSteps, width, i, t, tt, ttt, u, uu, uuu, x, y;

        drawSteps = Math.floor(curve.length());
        ctx.beginPath();
        for (i = 0; i < drawSteps; i++) {
            // Calculate the Bezier (x, y) coordinate for this step.
            t = i / drawSteps;
            tt = t * t;
            ttt = tt * t;
            u = 1 - t;
            uu = u * u;
            uuu = uu * u;

            x = uuu * curve.startPoint.x;
            x += 3 * uu * t * curve.control1.x;
            x += 3 * u * tt * curve.control2.x;
            x += ttt * curve.endPoint.x;

            y = uuu * curve.startPoint.y;
            y += 3 * uu * t * curve.control1.y;
            y += 3 * u * tt * curve.control2.y;
            y += ttt * curve.endPoint.y;

            width = startWidth + ttt * widthDelta;
            this._drawPoint(x, y, width);
        }
        ctx.closePath();
        ctx.fill();
    };

    DrawingPad.prototype._strokeWidth = function (velocity) {
        return Math.max(this.maxWidth / (velocity + 1), this.minWidth);
    };

    DrawingPad.prototype.getInkLines = function () {
        return this.inkLines;
    };

    DrawingPad.prototype.getListOfShapes = function () {
        return this.listOfShapes;
    };
	
	DrawingPad.prototype.undo = function () {
		if (this.listOfShapes.length != 0) {
			this.undoStack.push(this.listOfShapes.pop());
			this.clear();
			
			this.drawShapes();
		}
	};
	
	DrawingPad.prototype.redo = function () {
		if (this.undoStack.length != 0) {
			this.listOfShapes.push(this.undoStack.pop());
			this.clear();
			
			this.drawShapes();
		}
	};

    /**
     * Draw all shapes in listOfShapes to the canvas
     */
	DrawingPad.prototype.drawShapes = function () {
        // redraw all shapes again
		for(var i = 0; i < this.listOfShapes.length; i++) {
			var shape = this.listOfShapes[i];
            shape._draw(this._ctx, this);
		}
	}
	
    /**
     * Using touchevent from user, identifies the closest drawn line and stores it as "selected"
     */
    DrawingPad.prototype.selectLine = function (event) {
        var rect = this._canvas.getBoundingClientRect();
        // get touch coordinates within drawing canvas
        var touchCoords = {
            x : event.clientX - rect.left,
            y : event.clientY - rect.top
        }
        var closestLine = null;
        // unlikely to have a resolution where 900000 is applicable
        var smallestDistance = 900000;
        var currentDistance = null;           
        
        // find the line which is closest to the touched position
		for(var i = 0; i < this.inkLines.length; i++) {
			var line = this.getInkLines()[i];
			for(var j = 0; j < line.points.length; j++) {
				var point = line.points[j];                
				currentDistance = point.distanceTo(touchCoords);
                if (currentDistance < smallestDistance && currentDistance <= this.distanceThreshold) {
                    closestLine = line;
                    smallestDistance = currentDistance;
                }
			}
		}
        // store line as a selected line
        this.selectedLines.push(closestLine);
	};

    /**
     * Highlights all lines selected by the user
     */
    DrawingPad.prototype.highlightSelectedLines = function (event) {
        // clear the canvas before drawing
        this.clear();

        // draw unselected lines first in the default colour
        for(var i = 0; i < this.inkLines.length; i++) {
            this._reset();
			var line = this.getInkLines()[i];
			// check current line is not selected
            if (jQuery.inArray(line, this.selectedLines) == -1) {
                for(var j = 0; j < line.points.length; j++) {
                    var point = line.points[j];
                    var pointObj = new Point(point.x, point.y, point.time);
                    this._addPoint(pointObj);                    
                }
            }
		}

        // TEMPORARY ; will fix above
        for(var i = 0; i < this.listOfShapes.length; i++) {
			var shape = this.listOfShapes[i];
            if (shape.type != ShapeType.INKLINE) {
                shape._draw(this._ctx, this);
            }
		}

        // draw the selected lines
        for(var i = 0; i < this.selectedLines.length; i++) {
            // change canvas drawing colour to highlight colour and reset line property for each line to be drawn
            this._reset(this.selectedColor);
			var line = this.selectedLines[i];
            if (line != null) {
                for(var j = 0; j < line.points.length; j++) {
                    var point = line.points[j];
                    var pointObj = new Point(point.x, point.y, point.time);
                    this._addPoint(pointObj);    
                }
            }
		}

        // change back to default pen color
        this._ctx.fillStyle = this.penColor;
    }

    /**
     * Draw a shape based on its json values passed in
     */
	DrawingPad.prototype.drawFromJson = function (jsonShape) {
        // reset shape property
        this._reset();
        
        var shape;

        switch (jsonShape.type) {
            case ShapeType.INKLINE:
                shape = new InkLine('green');
                // iterate through each point
                for(var i = 0; i < jsonShape.points.length; i++) {
                        var jsonPoint = jsonShape.points[i];

                        // create javaObject point from json values
                        var point = new Point(jsonPoint.x, jsonPoint.y, jsonPoint.time);
                        
                        shape._addPointToLine(point);
                }
                break;
            case ShapeType.SQUARE:
                shape = new Square (jsonShape.x, jsonShape.y, jsonShape.w, jsonShape.h, jsonShape.colour);
                break;
            case ShapeType.CIRCLE:
                shape = new Circle (jsonShape.x, jsonShape.y, jsonShape.radius, jsonShape.colour);
                break;
            case ShapeType.TRIANGLE:
                shape = new Triangle (jsonShape.x, jsonShape.y, jsonShape.w, jsonShape.h, jsonShape.colour);
                break;
        }

        // redraw shape
        shape._draw(this._ctx, this);

        // add to existing shapes
        this.listOfShapes.push(shape);
    };

    /**
     * Set the drawing mode
     */
    DrawingPad.prototype.setMode = function (drawModeNum) {
        this.drawMode = drawModeNum;
    };

    var Point = function (x, y, time) {
        this.x = x;
        this.y = y;
        this.time = time || new Date().getTime();
    };

    Point.prototype.velocityFrom = function (start) {
        return (this.time !== start.time) ? this.distanceTo(start) / (this.time - start.time) : 1;
    };

    Point.prototype.distanceTo = function (start) {
        return Math.sqrt(Math.pow(this.x - start.x, 2) + Math.pow(this.y - start.y, 2));
    };

    var Bezier = function (startPoint, control1, control2, endPoint) {
        this.startPoint = startPoint;
        this.control1 = control1;
        this.control2 = control2;
        this.endPoint = endPoint;
    };

    // Returns approximated length.
    Bezier.prototype.length = function () {
        var steps = 10,
            length = 0,
            i, t, cx, cy, px, py, xdiff, ydiff;

        for (i = 0; i <= steps; i++) {
            t = i / steps;
            cx = this._point(t, this.startPoint.x, this.control1.x, this.control2.x, this.endPoint.x);
            cy = this._point(t, this.startPoint.y, this.control1.y, this.control2.y, this.endPoint.y);
            if (i > 0) {
                xdiff = cx - px;
                ydiff = cy - py;
                length += Math.sqrt(xdiff * xdiff + ydiff * ydiff);
            }
            px = cx;
            py = cy;
        }
        return length;
    };

    Bezier.prototype._point = function (t, start, c1, c2, end) {
        return          start * (1.0 - t) * (1.0 - t)  * (1.0 - t)
               + 3.0 *  c1    * (1.0 - t) * (1.0 - t)  * t
               + 3.0 *  c2    * (1.0 - t) * t          * t
               +        end   * t         * t          * t;
    };

    /**
     * Generic Shape class with standard constructor and _draw to be called
     */
    class Shape {
        constructor(type, colour) {
            this.type = type;
            this.colour = colour || '#AAAAAA';
        }

        _draw(ctx, drawingPad) {
            drawingPad._reset();
            ctx.fillStyle = this.colour;
        }

    }

    /**
     * Identifies the shape
     */
    const ShapeType = {
        INKLINE: 'INKLINE',
        CIRCLE:'CIRCLE',
        SQUARE: 'SQUARE',
        TRIANGLE: 'TRIANGLE'
    };

    /**
     * Represent a line of ink "stroke"
     */
    class InkLine extends Shape {
        constructor(colour) {
            super(ShapeType.INKLINE, colour);
            this.points = [];

        }

        _draw(ctx, drawingPad) {
            super._draw(ctx, drawingPad);

            // adds each individual point to drawing pad 			
			for(var j = 0; j < this.points.length; j++) {
				var point = this.points[j];
				drawingPad._addPoint(point);
			}
        }

        _addPointToLine(point) {
            this.points.push(point);
        }

    }

    /**
     * Represent a square/rectangle object
     */
    class Square extends Shape {
        // This is a very simple and unsafe constructor.
        // All we're doing is checking if the values exist.
        // "x || 0" just means "if there is a value for x, use that. Otherwise use 0."
        constructor (x, y, w, h, colour) {
            super(ShapeType.SQUARE, colour);
            this.x = x || 0;
            this.y = y || 0;
            this.w = w || 1;
            this.h = h || 1;
        }

        _draw(ctx, drawingPad) {
            super._draw(ctx, drawingPad);
            ctx.fillRect(this.x, this.y, this.w, this.h);
        }
    }

    /**
     *  Creates a square where specified
     */
    DrawingPad.prototype._createSquare = function (e) {
        var color,
            radius = 20,
            width = 20,
            height = 20;

        var centerPoint = this._createPoint(e);

        var square = new Square (centerPoint.x - width/2, centerPoint.y - height/2, width, height, color);
        this.listOfShapes.push(square);

        square._draw(this._ctx, this);
    };

    /**
     * Represent a circle object
     */
    class Circle extends Shape {
        constructor (x, y, radius, colour) {
            super(ShapeType.CIRCLE, colour);
            this.x = x || 0;
            this.y = y || 0;
            this.radius = radius || MIN_CIRCLE_RADIUS;
        }

        _draw(ctx, drawingPad) {
            super._draw(ctx, drawingPad);
            ctx.beginPath();

            // draws an arc that is 360 --> circle
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, true);
            ctx.closePath();

            // fills in the path to create  a filled circle
            ctx.fill();
        }
        
    }

    /**
     *  Creates a circle where specified
     */
    DrawingPad.prototype._createCircle = function (e) {
        var color,
            radius = 20;

        var centerPoint = this._createPoint(e);

        var circle = new Circle (centerPoint.x, centerPoint.y, radius, color);
        this.listOfShapes.push(circle);

        circle._draw(this._ctx, this);
    };

    /**
     * Represent a triangle object
     */
    class Triangle extends Shape {
        constructor (x, y, w, h, colour) {
            super(ShapeType.TRIANGLE, colour);
            this.x = x || 0;
            this.y = y || 0;
            this.w = w || 1;
            this.h = h || 1;
        }

        _draw(ctx, drawingPad) {
            super._draw(ctx, drawingPad);

            ctx.beginPath();
            // triangle created in the center of mouse
            ctx.moveTo(this.x + (this.w/2), this.y + (this.h/2));
            ctx.lineTo(this.x, this.y - (this.h/2));
            ctx.lineTo(this.x - (this.w/2),  this.y + (this.h/2));

            // triangle created at right corner
            // ctx.moveTo(this.x, this.y);
            // ctx.lineTo(this.x - (this.w/2), this.y - (this.h));
            // ctx.lineTo(this.x - this.w, this.y);
            ctx.closePath();
            ctx.fill();
        }
    }

    /**
     *  Creates a triangle where specified
     */
    DrawingPad.prototype._createTriangle = function (e) {
        var color,
            radius = 20,
            width = 20,
            height = 20;

        var centerPoint = this._createPoint(e);
        var triangle = new Triangle (centerPoint.x, centerPoint.y, width, height, color);
        this.listOfShapes.push(triangle);

        triangle._draw(this._ctx, this);
    };

    DrawingPad.prototype._startShapeOrLine = function(event) {
        switch (this.drawMode) {
            case drawModes.PEN:
                this._strokeBegin(event);
                break;
            case drawModes.CIRCLE:
                this._createCircle(event);
                break;
            case drawModes.SQUARE:
                this._createSquare(event);
                break;
            case drawModes.TRIANGLE:
                this._createTriangle(event);
            default:
                   //
        }
    };

    DrawingPad.prototype._updateShapeOrLineOnMove = function(event) {
        switch (this.drawMode) {
            case drawModes.PEN:
                this._strokeUpdate(event);
                break;
            default:
                   //
        }
    };

    DrawingPad.prototype._endShaopeOrLine = function(event) {
        switch (this.drawMode) {
            case drawModes.PEN:
                this._strokeEnd(event);
                break;
            default:
                   //
        }
    };

    return DrawingPad;
})(document);

return DrawingPad;

}));