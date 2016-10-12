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

    var drawModes = {
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
        this.selectedShapes = [];
        // used to determine if double tap or single tap
        this.touchTimer = null;
        this.isDoubleTap = false;
        // used to determine distance user has dragged their finger
        this.oldPos = {
            x: null,
            y: null
        };

        this.twoTouchDistanceX = 0;
        this.twoTouchDistanceY = 0;

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
                self._endShapeOrLine(event);
            }
        };

        this._handleTouchStart = function (event) {
             
            // if single finger used in touch
            if (event.targetTouches.length == 1) {
                    var context = this;
                    // record where user has tapped in case they are dragging selected shapes
                    var touch = event.changedTouches[0];
                    self.oldPos.x = touch.clientX - self._canvas.getBoundingClientRect().left;
                    self.oldPos.y = touch.clientY - self._canvas.getBoundingClientRect().top;
                    // if user does not tap again in timeout time limit then it is a single tap
                    if (this.touchTimer == null) {
                        this.touchTimer = setTimeout(function () {
                            context.touchTimer = null;                            
                            // handle depending on selected mode
                            self._startShapeOrLine(touch);
                        }, 500)
                    // otherwise it is a double tap
                    } else {                
                        // get line selected by user and highlight it
                        var touch = event.targetTouches[0];
                        self.selectShape(touch);
                        self.highlightSelectedShapes();
                        // reset touch timer  
                        clearTimeout(context.touchTimer);
                        context.touchTimer = null;
                        // signal to touchend that double tap has occurred
                        self.isDoubleTap = true;
                    }                
            }  else if (event.targetTouches.length == 2) {
                // indicate the canvas is in two touch mode
                self._twoTouch = true;
                
                // grab absolute distance between points in deltaX and deltaY form
                var distance = self._absDistanceBetweenTwoTouch(event);

                // record initial distance
                self.twoTouchDistanceX = distance.deltaX;
                self.twoTouchDistanceY = distance.deltaY;
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
            // check if user has selected shapes, if so, they are now attempting to drag to reposition shapes or resizing shapes
            if (self.selectedShapes[0] != null) {

                // if the canvas is in two touch modde
                if (self._twoTouch) {
                    // resize shapes if multi touch is on
                    self._resizeSelectedShapes(event);
                }  else {
                    // update shapes position due to drag touch
                    self.updateSelectedShapePositions(touch);
                }

                // clear canvas and redraw unselected shapes and selected shapes (which have now moved)
                self.clear();
                self.drawShapes(self.selectedShapes);
                self.drawShapes(self.getUnselectedShapes());
            } else {
                // handle depending on selected mode
                self._updateShapeOrLineOnMove(touch);
            }
            
        };

        this._handleTouchEnd = function (event) {
            self._twoTouch = false;
            var wasCanvasTouched = event.target === self._canvas;
            if (wasCanvasTouched) {
                event.preventDefault();

                // handle depending on selected mode
                self._endShapeOrLine(event);
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
		this.listOfShapes = [];
        this.selectedShapes = [];
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
        
        if (!this.isDoubleTap) {
            // save to local storage (if user is not selecting but is actually drawing)
            if (jQuery.inArray(this.inkLine, this.inkLines) == -1) {
                this.inkLines.push(this.inkLine);
            }

            // check that the previously drawn line is not being drawn again
            var isExistingLine = false;
            for(var i = 0; i < this.listOfShapes.length; i++) {
                var shape = this.listOfShapes[i];
                if (shape.type == ShapeType.INKLINE) {
                    if (this.inkLine.points.compare(shape.points)) {
                        isExistingLine = true;
                    }
                }
            }
            if (!isExistingLine) {
                this.listOfShapes.push(this.inkLine);
            }
        } else {
            // reset double tap flag
            this.isDoubleTap = false;
        }
        
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
     * Draw all shapes in given array to the canvas. If no array is passed this function will redraw all shapes
     */
	DrawingPad.prototype.drawShapes = function (shapes) {
        var shapeArray = shapes || this.listOfShapes;

        // redraw all shapes again
		for(var i = 0; i < shapeArray.length; i++) {
			var shape = shapeArray[i];
            shape._draw(this._ctx, this);
		}
	}
	
    /**
     * Using touchevent from user, identifies the closest drawn shape and stores it as "selected"
     */
    DrawingPad.prototype.selectShape = function (event) {
        var rect = this._canvas.getBoundingClientRect();
        // get touch coordinates within drawing canvas
        var touchCoords = {
            x : event.clientX - rect.left,
            y : event.clientY - rect.top
        }
        var closestShape = null;
        // unlikely to have a resolution where 900000 is applicable
        var smallestDistance = 900000;
        var currentDistance = null;           
        
        // find the shape which is closest to the touched position
		for(var i = 0; i < this.listOfShapes.length; i++) {
			var shape = this.listOfShapes[i];
            // if the current shape is not already selected
            if (jQuery.inArray(shape, this.selectedShapes) == -1) {
                // if current shape is an ink line
                if (shape.type == ShapeType.INKLINE) {
                    // go through each point of the ink line to determine if this line is closest to touch position
                    for(var j = 0; j < shape.points.length; j++) {
                        var point = shape.points[j];                
                        currentDistance = point._distanceTo(touchCoords);
                        if (currentDistance < smallestDistance && currentDistance <= this.distanceThreshold) {
                            closestShape = shape;
                            smallestDistance = currentDistance;
                        }
                    }
                } else {
                    // check distance between touch position and centre of shape to determine if closest
                    currentDistance = shape._distanceTo(touchCoords);
                    if (currentDistance < smallestDistance && currentDistance <= this.distanceThreshold) {
                        closestShape = shape;
                        smallestDistance = currentDistance;
                    }
                }
            }
		}

        // store line as a selected line
        if (closestShape != null) {
            this.selectedShapes.push(closestShape);
        }
	};

    /**
     * Highlights all shapes selected by the user
     */
    DrawingPad.prototype.highlightSelectedShapes = function (event) {
        // clear the canvas before drawing
        this.clear();

        // draw unselected shapes first in the default colour
        for(var i = 0; i < this.listOfShapes.length; i++) {
			var shape = this.listOfShapes[i];
			// check current shape is not selected
            if (jQuery.inArray(shape, this.selectedShapes) == -1) {
                shape._draw(this._ctx, this);
            }
		}

        // draw the selected shapes
        for(var i = 0; i < this.selectedShapes.length; i++) {
			var shape = this.selectedShapes[i];
            // change shape colour to the highlight colour and draw it
            shape.colour = this.selectedColor;
            shape._draw(this._ctx, this);
		}

        // change back to default pen color
        this._ctx.fillStyle = this.penColor;
    }

    /**
     * Deselects all shapes.
     */
    DrawingPad.prototype.deselectShapes = function (event) {
        // Change colour of all selected shapes back to their original colours
        // This will change the same shapes within this.listOfShapes as they are held by reference.
        for(var i = 0; i < this.selectedShapes.length; i++) {
            var shape = this.selectedShapes[i];
            shape.colour = shape.originalColour;            
        }

        // selectedShapes array can now be safely set to empty
        this.selectedShapes = [];

        // clear canvas and redraw all shapes
        this.clear();
        this.drawShapes();
    }

    /**
     * Update position of selected shapes based on distance user has dragged
     */
    DrawingPad.prototype.updateSelectedShapePositions = function (event) {
        var rect = this._canvas.getBoundingClientRect();
        var newX = event.clientX - rect.left;
        var newY = event.clientY - rect.top;
        var diffX = newX - this.oldPos.x;
        var diffY = newY - this.oldPos.y;

        // update position of selected shapes
        for (var i = 0; i < this.selectedShapes.length; i++) {
            var shape = this.selectedShapes[i];
            if (shape.type != ShapeType.INKLINE) {
                shape.x += diffX;
                shape.y += diffY;
            } else {
                shape._updatePosition(diffX, diffY);
            }
        }

        // update previous touch position
        this.oldPos.x = newX;
        this.oldPos.y = newY;
    }

    /**
     * Returns the shapes that are unselected
     */
    DrawingPad.prototype.getUnselectedShapes = function () {
        var unselectedShapes = [];

        for (var i = 0; i < this.listOfShapes.length; i++) {
            var shape = this.listOfShapes[i];
            // if current shape is not selected, include it in the array to be returned.
            if (jQuery.inArray(shape, this.selectedShapes) == -1) {
                unselectedShapes.push(shape);
            }
        }

        return unselectedShapes;
    }

    /**
     * Compares two arrays for equality. Returns true if they are equal.
     * Actually works.
     */
    Array.prototype.compare = function(testArr) {
        if (this.length != testArr.length) return false;
        for (var i = 0; i < testArr.length; i++) {
            if (this[i].compare) {
                if (!this[i].compare(testArr[i])) return false;
            }
            else if (this[i] !== testArr[i]) return false;
        }
        return true;
    }

    /**
     * Draw a shape based on its json values passed in
     */
    DrawingPad.prototype.drawFromJson = function (jsonShape) {
        // reset shape property
        this._reset();
        
        var shape;

        var shapeType = jsonShape.type;

        if (shapeType == ShapeType.INKLINE) {
            shape = new InkLine('green');
            // iterate through each point
            for(var i = 0; i < jsonShape.points.length; i++) {
                    var jsonPoint = jsonShape.points[i];

                    // create javaObject point from json values
                    var point = new Point(jsonPoint.x, jsonPoint.y, jsonPoint.time);
                    
                    shape._addPointToLine(point);
            }
        } else if (shapeType == ShapeType.SQUARE) {
            shape = new Square (jsonShape.x, jsonShape.y, jsonShape.w, jsonShape.h, jsonShape.colour);
        } else if (shapeType == ShapeType.CIRCLE) {
            shape = new Circle (jsonShape.x, jsonShape.y, jsonShape.w, jsonShape.h, jsonShape.colour);
        } else if (shapeType == ShapeType.TRIANGLE) {
            shape = new Triangle (jsonShape.x, jsonShape.y, jsonShape.w, jsonShape.h, jsonShape.colour);
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

    /**
     * Returns the absolute distance between two touch points in deltaX and deltaY form 
     */
    DrawingPad.prototype._absDistanceBetweenTwoTouch = function(event) {
        var touch_A = event.touches[0];
        var touch_B = event.touches[1];

        var rect = this._canvas.getBoundingClientRect();
        var newX_A = touch_A.clientX - rect.left;
        var newY_A = touch_A.clientY - rect.top;

        var newX_B = touch_B.clientX - rect.left;
        var newY_B = touch_B.clientY - rect.top;

        return {
            deltaX : Math.abs(newX_B - newX_A),
            deltaY : Math.abs(newY_B - newY_A)
        }
    }


    /**
     * Increase size based on two touch 
     */
    DrawingPad.prototype._resizeSelectedShapes = function (event) {
        // grab absolute distance between points in deltaX and deltaY form
        var distance = this._absDistanceBetweenTwoTouch(event);

        // get theta angle between the distance between each point 
        var theta = Math.atan2(distance.deltaY, distance.deltaX) * (180 / Math.PI); //(y, x) // rads to degs, range (-180, 180)
        // range (0, 90) --> because we give in absolute delta values (positives)

        // loop through selected list and increase size
        for (var i = 0; i < this.selectedShapes.length; i++) {
            var shape = this.selectedShapes[i];
            var value = 10;
            var min = 20;
            var maxH = this._canvas.height * 0.8;
            var maxW = this._canvas.width * 0.8;
            
            // special case for triangle to make it not as small
            if (shape.type == ShapeType.TRIANGLE) {
                min = 40;
            } else if (shape.type == ShapeType.CIRCLE) {
                // adjust max values to half (radius)
                maxW = maxW / 2;
                maxH = maxH / 2;
            }

            if (shape.type != ShapeType.INKLINE) {
                // touch points are horizontally aligned (0 - 20)
                if (theta <= 20) {

                    // when there is a decrease in distance between prior touch points --> decrease size
                    if (distance.deltaX < this.twoTouchDistanceX) {
                        value = -value;
                    }
                    // horizontal resize (width, height) in width
                    shape._resize(value, 0, min, maxW, maxH);

                // touch points are diagonally  aligned  (21 -70) 
                } else if (theta > 20 && theta <= 70) {

                    // when there is a decrease in distance between prior touch points --> decrease size
                    if (distance.deltaX < this.twoTouchDistanceX || distance.deltaY < this.twoTouchDistanceY) {
                        value = -value;
                    }
                    shape._resize(value, value, min, maxW, maxH);
                // touch points are vertically aligned (71 - 90)
                } else {

                    // when there is a decrease in distance between prior touch points --> decrease size
                    if (distance.deltaY < this.twoTouchDistanceY) {
                        value = -value;
                    }
                    // vertical resize in height
                    shape._resize(0, value, min, maxW, maxH);
                }
            } 
        }

        // update previous touch distance difference
        this.twoTouchDistanceX = distance.deltaX;
        this.twoTouchDistanceY = distance.deltaY;
    }

    var Point = function (x, y, time) {
        this.x = x;
        this.y = y;
        this.time = time || new Date().getTime();
    };

    Point.prototype.velocityFrom = function (start) {
        return (this.time !== start.time) ? this._distanceTo(start) / (this.time - start.time) : 1;
    };

    Point.prototype._distanceTo = function (start) {
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
        constructor(type, colour, x, y, w, h) {
            this.type = type;
            this.colour = colour || '#AAAAAA';
            // used to revert back to the shape's original colour after it has been deselected.
            this.originalColour = colour || '#AAAAAA';
            this.x = x || 0;
            this.y = y || 0;
            this.w = w || 1;
            this.h = h || 1;
        }

        _draw(ctx, drawingPad) {
            drawingPad._reset();
            ctx.fillStyle = this.colour;
        }

        // calculates distance between given start point and the centre of this shape
        _distanceTo(start) {
            return Math.sqrt(Math.pow(this.x - start.x, 2) + Math.pow(this.y - start.y, 2));
        }

        // resize the shape by x amount
        _resize(deltaW, deltaH, min, maxW, maxH) {
            // ensure it remains in minimum and maximum range
            if (this.w + deltaW >= min && this.w + deltaW <= maxW) { 
                this.w += deltaW;
            }
            if (this.h + deltaH >= min && this.h + deltaH <= maxH) {  
                this.h += deltaH;
            }
        }

    }

    /**
     * Identifies the shape
     */
    var ShapeType = {
        INKLINE: 'INKLINE',
        CIRCLE:'CIRCLE',
        SQUARE: 'SQUARE',
        TRIANGLE: 'TRIANGLE'
    };

    /**
     * Represent a line of ink "stroke"
     */
    class InkLine {
        constructor(colour) {
            this.type = ShapeType.INKLINE;
            this.colour = colour || '#AAAAAA';
            this.points = [];
        }

        _draw(ctx, drawingPad) {
            drawingPad._reset();
            ctx.fillStyle = this.colour;

            // adds each individual point to drawing pad 			
			for(var j = 0; j < this.points.length; j++) {
				var point = this.points[j];
				drawingPad._addPoint(point);
			}
        }

        _addPointToLine(point) {
            this.points.push(point);
        }

        _updatePosition(diffX, diffY) {
            for(var j = 0; j < this.points.length; j++) {
				var point = this.points[j];
				point.x += diffX;
                point.y += diffY;
			}
        }
    }


    /**
     * Represent a square/rectangle object
     */
    class Square extends Shape {
        constructor (x, y, w, h, colour) {
            super(ShapeType.SQUARE, colour, x, y, w, h);
        }

        _draw(ctx, drawingPad) {
            super._draw(ctx, drawingPad);
            ctx.fillRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h);
        }
    }

    /**
     *  Creates a square where specified
     */
    DrawingPad.prototype._createSquare = function (e) {
        var color,
            width = 40,
            height = 40;

        var centerPoint = this._createPoint(e);

        var square = new Square (centerPoint.x - width/2, centerPoint.y - height/2, width, height, color);
        this.listOfShapes.push(square);

        square._draw(this._ctx, this);
    };

    /**
     * Represent a circle object
     */
    class Circle extends Shape {
        constructor (x, y, w, h, colour) {
            super(ShapeType.CIRCLE, colour, x, y, w, h);
        }

        _draw(ctx, drawingPad) {
            super._draw(ctx, drawingPad);
            ctx.beginPath();

            // draw an ellipse
            ctx.ellipse(this.x, this.y, this.w, this.h, 0, 0, Math.PI*2);
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

        var circle = new Circle (centerPoint.x, centerPoint.y, radius, radius, color);
        this.listOfShapes.push(circle);

        circle._draw(this._ctx, this);
    };

    /**
     * Represent a triangle object
     */
    class Triangle extends Shape {
        constructor (x, y, w, h, colour) {
            super(ShapeType.TRIANGLE, colour, x, y, w, h);
        }

        _draw(ctx, drawingPad) {
            super._draw(ctx, drawingPad);

            ctx.beginPath();
            // triangle created in the center of mouse
            ctx.moveTo(this.x + (this.w/2), this.y + (this.h/2));
            ctx.lineTo(this.x, this.y - (this.h/2));
            ctx.lineTo(this.x - (this.w/2),  this.y + (this.h/2));

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
            width = 40,
            height = 40;

        var centerPoint = this._createPoint(e);
        var triangle = new Triangle (centerPoint.x, centerPoint.y, width, height, color);
        this.listOfShapes.push(triangle);

        triangle._draw(this._ctx, this);
    };

    DrawingPad.prototype._startShapeOrLine = function(event) {

        if (this.drawMode == drawModes.PEN) {
            this._strokeBegin(event);
        } else if (this.drawMode == drawModes.CIRCLE) {
            this._createCircle(event);
        } 
        else if (this.drawMode == drawModes.SQUARE) {
             this._createSquare(event);
         } else if (this.drawMode == drawModes.TRIANGLE) {
             this._createTriangle(event);
         }
    };

    DrawingPad.prototype._updateShapeOrLineOnMove = function(event) {
        if (this.drawMode == drawModes.PEN) {
            this._strokeUpdate(event);
        }
    };

    DrawingPad.prototype._endShapeOrLine = function(event) {
        if (this.drawMode == drawModes.PEN) {
            this._strokeEnd(event);
        }
    };

    return DrawingPad;
})(document);

return DrawingPad;

}));