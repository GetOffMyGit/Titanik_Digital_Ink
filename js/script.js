$(document).ready(function() {
    var mainCanvas = document.querySelector("#mainCanvas");
    var drawingPad = new DrawingPad(mainCanvas, {
        dotSize: 1,
        minWidth: 1,
        maxWidth: 1,
        penColor: "rgb(66, 133, 244)"
    });

    drawingPad.on();
});

