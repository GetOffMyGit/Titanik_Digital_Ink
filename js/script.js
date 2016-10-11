$(document).ready(function() {
    var mainCanvas = document.querySelector("#mainCanvas");
    var drawingPad = new DrawingPad(mainCanvas, {
        dotSize: 1,
        minWidth: 1,
        maxWidth: 1,
        penColor: "rgb(66, 133, 244)"
    });

    drawingPad.on();
	
    var deselectButton = $("#deselectButton")[0];
	var undoButton = $("#undoButton")[0];
    var saveButton = $("#saveButton")[0];
    var loadButton = $("#loadButton")[0];
    var downloadRef = $("#downloadLink")[0];
    var penButton = $("#penButton")[0];
    var circleShapeButton = $("#circleShapeButton")[0];
    var squareShapeButton = $("#squareShapeButton")[0];
    var triangleShapeButton = $("#triangleShapeButton")[0];
    var increaseSizeButton = $("#increaseSizeButton")[0];
    var decreaseSizeButton = $("#decreaseSizeButton")[0];

    $("#downloadLink").hide();
	
    deselectButton.addEventListener("click", function () {
		drawingPad.deselectShapes();
	});

	undoButton.addEventListener("click", function () {
		drawingPad.undo();
	});
	
	redoButton.addEventListener("click", function () {
		drawingPad.redo();
	});
	
	clearButton.addEventListener("click", function () {
	swal({
		title: "Are you sure?",
		text: "You will not be able to recover any drawings!",
		type: "warning",
		showCancelButton: true,
		confirmButtonColor: "#DD6B55",
		confirmButtonText: "Yes, clear it!",
		closeOnConfirm: false
	},function(){
		drawingPad.clear();
		drawingPad.clearStack();
		swal("Cleared!", "Your drawing pad has been reset.", "success");
		});		
	});
	
    saveButton.addEventListener("click", function () {
        var inkLines = drawingPad.getListOfShapes();

        var json = JSON.stringify(inkLines);
        var blob = new Blob([json], {type: "application/json"});
        var url  = URL.createObjectURL(blob);

        $("#downloadLink").show();
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

    
    // keeps one draw tool always "active"
    $(".draw-tool").click(function(){
        $(".draw-tool").removeClass("active");
        $(this).addClass("active");
    });

    penButton.addEventListener("click", function () {
        drawingPad.setMode(0);
    });

    circleShapeButton.addEventListener("click", function () {
        drawingPad.setMode(1);
    });

    squareShapeButton.addEventListener("click", function () {
        drawingPad.setMode(2);
    });

    triangleShapeButton.addEventListener("click", function () {
        drawingPad.setMode(3);
    });

    increaseSizeButton.addEventListener("click", function () {
        drawingPad.resizeSelectedShapes(10);
    });

    decreaseSizeButton.addEventListener("click", function () {
        drawingPad.resizeSelectedShapes(-10);
    });
});

