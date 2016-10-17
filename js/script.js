$(document).ready(function () {
    var mainCanvas = document.querySelector("#mainCanvas");
    var drawingPad = new DrawingPad(mainCanvas, {
        dotSize: 1.2,
        minWidth: 1.2,
        maxWidth: 1.2,
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

    $("#downloadLink").hide();

    // simpleColorPicker functions
    // https://github.com/tkrotoff/jquery-simplecolorpicker
    $('select[name="colorPicker"]').on('change', function () {
        drawingPad.setColour($('select[name="colorPicker"]').val());
    });
    $('select[name="colorPickerBackground"]').on('change', function () {
        $(document.body).css('background-color', $('select[name="colorPickerBackground"]').val());
    });
    $('select[name="colorPicker"]').simplecolorpicker({ picker: true, theme: 'fontawesome' });
    $('select[name="colorPickerBackground"]').simplecolorpicker({ picker: true, theme: 'fontawesome' });

    // button functions
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
        }, function () {
            drawingPad.clear();
            drawingPad.clearStack();
            swal("Cleared!",
                "Your drawing pad has been reset.",
                "success");
        });
    });
    saveButton.addEventListener("click", function () {
        var inkLines = drawingPad.getListOfShapes();
        var json = JSON.stringify(inkLines);
        var blob = new Blob([json], {
            type: "application/json"
        });
        var url = URL.createObjectURL(blob);
        if (firebase.auth().currentUser == null) {
            googleSignIn();
        } else {
            swal({
                title: "Project Name",
                text: "Please specify the project name.",
                type: "input",
                showCancelButton: true,
                closeOnConfirm: false,
                animation: "slide-from-top",
                inputPlaceholder: "Project Name"
            },
                function (projectName) {
                    if (projectName === false) {
                        return false;
                    }
                    if (projectName === "") {
                        swal.showInputError("Please specify a project name.");
                        return false;
                    }
                    var codeString = $('#codeBlock').text();
                    var projectKey = firebase.database().ref('/users/' + firebase.auth().currentUser.uid + '/' + projectName).push().key;
                    firebase.database().ref('/users/' + firebase.auth().currentUser.uid + '/' + projectName).update({
                        code: codeString,
                        drawing: json,
                        projectKey: projectKey
                    }).then(function () {
                        swal("Project " + projectName + " Saved.", "Project Key: " + projectKey, "success");
                    });
                });
        }
    });
    loadButton.addEventListener("click", function () {
        //TODO: load from external chosen file
        // no input while loading ink
        drawingPad.off();
        if (firebase.auth().currentUser == null) {
            googleSignIn();
        } else {
            var projectButtonsHTML = "";
            firebase.database().ref('/users/' + firebase.auth().currentUser.uid).once('value').then(function (snapshot) {
                snapshot.forEach(function (childSnapshot) {
                    projectButtonsHTML += "<button class='projectButton'>" + childSnapshot.key + "</button>";
                });
                projectButtonsHTML += "<button id='loadFromKeyButton>Load from Key</button>";
            }).then(function () {
                swal({
                    title: "Please select the project to load",
                    text: projectButtonsHTML,
                    html: true,
                    confirmButtonText: "Load from project key",
					showCancelButton: true,
                    closeOnConfirm: false
                }, function () {
                    swal({
                        title: "Load From Project Key",
                        text: "Project Key",
                        type: "input"
                    },
                        function (projectKey) {
                            if (projectKey === false) {
                                return false;
                            }
                            if (projectKey === "") {
                                swal.showInputError("Pleas input a project key.");
                                return false;
                            }
                            firebase.database().ref("/users").once('value', function (snapshot) {
                                snapshot.forEach(function (userSnapshot) {
                                    firebase.database().ref('/users/' + userSnapshot.key).orderByChild('projectKey').equalTo(projectKey).once('value', function (snapshot) {
                                        snapshot.forEach(function (projectSnap) {
                                            $('#codeBlock').text(projectSnap.val().code);
                                            var drawingJson = JSON.parse(projectSnap.val().drawing);
                                            $('pre code').each(function (i, block) {
                                                hljs.highlightBlock(block);
                                            });
                                            for (var i = 0; i < drawingJson.length; i++) {
                                                drawingPad.drawFromJson(drawingJson[i]);
                                            }
                                        });
                                    });
                                });
                            });
                        });
                });
            });
        }
        drawingPad.on();
    });

    // keeps one draw tool always "active"
    $(".draw-tool").click(function () {
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

    $(document).on('click', '.projectButton', function () {
        var projectName = this.textContent;
        if (projectName != null) {
            firebase.database().ref('/users/' + firebase.auth().currentUser.uid + '/' + projectName).once('value').then(function (snapshot) {
                $('#codeBlock').text(snapshot.val().code);
                var drawingJson = JSON.parse(snapshot.val().drawing);
                $('pre code').each(function (i, block) {
                    hljs.highlightBlock(block);
                });
                for (var i = 0; i < drawingJson.length; i++) {
                    drawingPad.drawFromJson(drawingJson[i]);
                }
            });
        }
    });
});