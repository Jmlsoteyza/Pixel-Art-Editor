// The State

class Picture {
    constructor(width, height, pixels) {
        this.width = width;
        this.height = height;
        this.pixels = pixels;
    }
    static empty(width, height, color) {
        let pixels = new Array(width * height).fill(color);
        return new Picture(width, height, pixels);
    }
    pixel(x, y) {
        return this.pixels[x + y * this.width];
    }
    draw(pixels) {
        let copy = this.pixels.slice();
        for (let {x, y, color} of pixels) {
            copy [x + y * this.width] = color;
        }
        return new Picture(this.width, this.height, copy);
    }
}

function updateState(state, action) {
    return Object.assign({}, state, action);
}

function elt(type, props, ...children) {
    let dom = document.createElement(type);
    if (props) Object.assign(dom, props);
    for (let child of children) {
        if (typeof child != "string") dom.appendChild(child);
        else dom.appendChild(document.createTextNode(child));
    }
    return dom;
}


// CANVAS

const scale = 10;

class PictureCanvas {
    constructor(picture, pointerDown) {
        this.dom = elt("canvas", {
            onmousedown: event => this.mouse(event, pointerDown),
            ontouchstart: event => this.touch(event, pointerDown)
        });
        this.syncState(picture);
    }
    syncState(picture) {
        if (this.picture == picture) return;
        this.picture = picture;
        drawPicture(this.picture, this.dom, scale);
    }
}

// pixel square by square

function drawPicture(picture, canvas, scale) {
    canvas.width = picture.width * scale;
    canvas.height = picture.height * scale;
    let cx = canvas.getContext("2d");

    for (let y = 0; y < picture.height; y++) {
        for (let x = 0; x < picture.width; x++) {
            cx.fillStyle = picture.pixel(x, y);
            cx.fillRect(x * scale, y * scale, scale, scale);
        }
    }
}
// mouse pointer down

PictureCanvas.prototype.mouse = function(downEvent, onDown) {
    if (downEvent.button != 0) return;
    let pos = pointerPosition(downEvent, this.dom);
    let onMove = onDown(pos);
    if (!onMove) return;
    let move = moveEvent => {
        if (moveEvent.buttons == 0) {
            this.dom.removeEventListener("mousemove", move);
        } else {
            let newPos = pointerPosition(moveEvent, this.dom);
            if (newPos.x == pos.x && newPos.y == pos.y) return;
            pos = newPos;
            onMove(newPos);
        }
    };
    this.dom.addEventListener("mousemove", move);
};

function pointerPosition(pos, domNode) {
    let rect = domNode.getBoundingClientRect();
    return {x: Math.floor((pos.clientX - rect.left) / scale),
            y: Math.floor((pos.clientY - rect.top)/ scale)};
}

// position of the canvas on the screen with touch events (clientX and clientY)

PictureCanvas.prototype.touch = function(startEvent, onDown) {
    let pos = pointerPosition(startEvent.touches[0], this.dom);
    let onMove = onDown(pos);
    startEvent.preventDefault();
    if (!onMove) return;
    let move = moveEvent => {
        let newPos = pointerPosition(moveEvent.touches[0], this.dom);
        if (newPos.x == pos.x && newPos.y == pos.y) return;
        pos = newPos;
        onMove(newPos);
    };
    let end = () => {
        this.dom.removeEventListener("touchmove", move);
        this.dom.removeEventListener("touchend", end);
    };
    this.dom.removeEventListener("touchmove", move);
    this.dom.removeEventListener("touchmove", end);
}


// The application. will be used by current application state, picture position and a dispatch function as arguments

class PixelEditor {
    constructor(state, config) {
        let {tools, controls, dispatch} = config;
        this.state = state;

        this.canvas = new PictureCanvas(state.picture, pos => {
            let tool = tools[this.state.tool];
            let onMove = tool(pos, this.state, dispatch);
            if (onMove) return pos => onMove(pos, this.state);
        });

        this.controls = controls.map(
            Control => new Control(state, config));
            this.dom = elt("div", {}, this.canvas.dom, elt("br"),
            ...this.controls.reduce(
            (a, c) => a.concat(" ", c.dom), []));
    }
    syncState(state) {
        this.state = state;
        this.canvas.syncState(state.picture);
        for (let ctrl of this.controls) ctrl.syncState(state);
    }
}
// This is a tool select, where pointer is used as handler and <select> element within the dom. 

class ToolSelect {
    constructor(state, {tools, dispatch}) {
        this.select = elt("select", {
            onchange: () => dispatch({tool: this.select.value}),
            style: "background-color: black; color: white; outline: none; border:none; text-align: center; padding-top: 0.3rem; padding-bottom: 0.3rem; margin-right: 3rem;"
        }, ...Object.keys(tools).map(name => elt("option", {
            selected: name == state.tool,
        }, name)));
        this.dom = elt("label", null, "🖌️ Tool: ", this.select);
    }
    syncState(state) {
        this.select.value = state.tool;
    }
}





// canvas picture color select
class ColorSelect {
    constructor(state, {dispatch}) {
        this.input = elt("input", {
            type: "color",
            value: state.color,
            onchange: () => dispatch({color: this.input.value}),
            style: "position: absolute; bottom: 3.5%;"
        });
        this.dom = elt("label", null, "🎨 Color: ", this.input);
    }
    syncState(state) { this.input.value = state.color; }
}

// Drawing tools = where the tools will control the functionality of mouse or touch events on the canvas. Function calls the drawPixel function but then also return it so called again for newly touched pixels when the user drags or swipes over the picture

function draw(pos, state, dispatch) {
    function drawPixel({x, y}, state) {
        let drawn = {x, y, color: state.color};
        dispatch({picture: state.picture.draw([drawn])});
    }
    drawPixel(pos, state);
    return drawPixel;
}

// Rectangle tool to draw a rectangle between the point to start and dragging it the point
function rectangle(start, state, dispatch) {
    function drawRectangle(pos) {
        let xStart = Math.min(start.x, pos.x);
        let yStart = Math.min(start.y, pos.y);
        let xEnd = Math.max(start.x, pos.x);
        let yEnd = Math.max(start.y, pos.y);
        let drawn = [];
        for (let y = yStart; y <= yEnd; y++) {
            for (let x = xStart; x <= xEnd; x++) {
                drawn.push({x, y, color: state.color});
            }
        }
        dispatch({picture: state.picture.draw(drawn)});
    }
    drawRectangle(start);
    return drawRectangle;
}

// route to find all conntected pixels

const around = 
[{dx: -1, dy: 0}, {dx: 1, dy: 0},
{dx: 0, dy: -1}, {dx: 0, dy: 1}];

    function fill({x, y}, state, dispatch) {
        let targetColor = state.picture.pixel(x, y);
        let drawn = [{x, y, color: state.color}];
        for (let done = 0; done < drawn.length; done++) {
          for (let {dx, dy} of around) {
            let x = drawn[done].x + dx, y = drawn[done].y + dy;
            if (x >= 0 && x < state.picture.width &&
                y >= 0 && y < state.picture.height &&
                state.picture.pixel(x, y) == targetColor &&
                !drawn.some(p => p.x == x && p.y == y)) {
              drawn.push({x, y, color: state.color});
            }
        }
    }
    dispatch({picture: state.picture.draw(drawn)});
}

function pick(pos, state, dispatch) {
    dispatch({color: state.picture.pixel(pos.x, pos.y)});
}

// Save and loading, adding a button.
// The component keeps track of the current picture so that it can access it when saving. To create the image file, it uses a <canvas> element that it draws the picture on (at a scale of one pixel per pixel). The toDataURL method on a canvas element creates a URL that starts with data:. Unlike http: and https: URLs, data URLs contain the whole resource in the URL.

class SaveButton {
    constructor(state) {
        this.picture = state.picture;
        this.dom = elt("button", {
            onclick: () => this.save(),
            style: "margin-left: 9rem; margin-right: 0.5rem; margin-bottom: 0.3rem; background-color: #000000; color: white; padding-top: 0.5rem; padding-bottom: 0.5rem; font-size: 14px;" 
        }, "💾 Save");
        this.dom.addEventListener("mouseenter", () => {
            this.dom.style.backgroundColor = "#333333";
        });
        this.dom.addEventListener("mouseleave", () => {
            this.dom.style.backgroundColor = "#000000";
        });
    }
    save() {
        let canvas = elt("canvas");
        drawPicture(this.picture, canvas, 1);
        let link = elt("a", {
            href: canvas.toDataURL(),
            download: "pixelart.png"
        });
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
    syncState(state) { this.picture = state.picture; }
}

// Load button

class LoadButton {
    constructor(_, {dispatch}) {
        this.dom = elt("button", {
            onclick: () => startLoad(dispatch),
            style: "margin-left: 0.3rem; margin-right: 0.5rem; margin-bottom: 0.3rem; background-color: #000000; color: white; padding-top: 0.5rem; padding-bottom: 0.5rem; font-size: 14px"
        }, "📁 Load");
        this.dom.addEventListener("mouseenter", () => {
            this.dom.style.backgroundColor = "#333333";
        });
        this.dom.addEventListener("mouseleave", () => {
            this.dom.style.backgroundColor = "#000000";
        });
    }
    syncState() {}
}

function startLoad(dispatch) {
    let input = elt("input", {
        type: "file",
        onchange: () => finishLoad(input.files[0], dispatch)
    });
    document.body.appendChild(input);
    input.click();
    input.remove();
}

// Finish the load

function finishLoad(file, dispatch) {
    if (file == null) return;
    let reader = new FileReader();
    reader.addEventListener("load", () => {
        let image = elt("img", {
            onload: () => dispatch({
                picture: pictureFromImage(image)
                
            }),
            src: reader.result
        });
        
    });
    reader.readAsDataURL(file);
}

// Getting the image of data by constructing a picture object and it is limited to 100 by 100 pixel since anything bigger will look huge on display and might slow down the interface.

function pictureFromImage(image) {
    let width = Math.min(100, image.width);
    let height = Math.min(100, image.height);
    let canvas = elt("canvas", {width, height});
    let cx = canvas.getContext("2d");
    cx.drawImage(image, 0, 0);
    let pixels  = [];
    let {data} = cx.getImageData(0, 0, width, height);

    function hex(n) {
        return n.toString(16).padStart(2, "0");
    }
    for (let i = 0; i < data.length; i += 4) {
        let [r, g, b] = data.slice(i, i + 3);
        pixels.push("#" + hex(r) + hex(g) + hex(b));
    }
    return new Picture(width, height, pixels);
}

// Undo action

function historyUpdateState(state, action) {
    if (action.undo == true) {
      if (state.done.length == 0) return state;
      return Object.assign({}, state, {
        picture: state.done[0],
        done: state.done.slice(1),
        doneAt: 0
      });
    } else if (action.picture && state.doneAt < Date.now() - 1000) {
      return Object.assign({}, state, action, {
        done: [state.picture, ...state.done],
        doneAt: Date.now()
      });
    } else {
      return Object.assign({}, state, action);
    }
  }
  
  class UndoButton {
    constructor(state, {dispatch}) {
        this.dom = elt("button", {
            onclick: () => dispatch({undo: true}),
            disabled: state.done.length == 0,
            style: "margin-left: 0.3rem; margin-right: 0.5rem; margin-bottom: 0.3rem; background-color: #000000; color: white; padding-top: 0.5rem; padding-bottom: 0.5rem; font-size: 14px"
        }, "⮪ Undo");
        this.dom.addEventListener("mouseenter", () => {
            this.dom.style.backgroundColor = "#333333";
        });
        this.dom.addEventListener("mouseleave", () => {
            this.dom.style.backgroundColor = "#000000";
        });
    }
    syncState(state) {
        this.dom.disabled = state.done.length == 0;
    }
  }

// the canvas draw

const startState = {
    tool: "draw",
    color: "#000000",
    picture: Picture.empty(70, 50, "#f0f0f0"),
    done: [],
    doneAt: 0,
};

const baseTools = {draw, fill, rectangle, pick};

const baseControls = [
    ToolSelect, ColorSelect, SaveButton, LoadButton, UndoButton
];

function startPixelEditor
({state = startState, tools = baseTools, controls = baseControls}) {
    let app = new PixelEditor(state, {
        tools,
        controls,
        dispatch(action) {
            state = historyUpdateState(state, action);
            app.syncState(state);
        }
    });
    return app.dom
}


