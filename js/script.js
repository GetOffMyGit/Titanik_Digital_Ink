$(document).ready(function() {
    var mainCanvas = document.querySelector("#mainCanvas");
    var drawingPad = new DrawingPad(mainCanvas, {
        dotSize: 1,
        minWidth: 1,
        maxWidth: 1,
        penColor: "rgb(66, 133, 244)"
    });

    drawingPad.on();
	
	var undoButton = $("#undoButton")[0];
    var saveButton = $("#saveButton")[0];
    var loadButton = $("#loadButton")[0];
    var downloadRef = $("#download")[0];

    $("#download").hide();
	
	undoButton.addEventListener("click", function () {
		drawingPad.undo();
	};
	
    saveButton.addEventListener("click", function () {
        var inkLines = drawingPad.getInkLines();

        var json = JSON.stringify(inkLines);
        var blob = new Blob([json], {type: "application/json"});
        var url  = URL.createObjectURL(blob);

        $("#download").show();
        downloadRef.download = "inks.json";
        downloadRef.href        = url;
        downloadRef.textContent = "Download inks.json";
    });

    loadButton.addEventListener("click", function () {
        //TODO: load from external chosen file

        // no input while loading ink
        drawingPad.off();
        $.getJSON("inks.json", function(json) {
            // iterate through all the lines
            for(var i = 0; i < json.length; i++) {
                var line = json[i];

                // draw the line given by points
                drawingPad.drawFromJson(line);
            }

            // allow ink after input done
            drawingPad.on();
        });
    });
});

