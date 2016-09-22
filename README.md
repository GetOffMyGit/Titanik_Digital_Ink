# Titanik_Digital_Ink
Using Digital Ink to Teach Programming 

### Setup
Download and install Node.js from here [Download Link](https://nodejs.org/en/download/).

To grab all the node packages run the following command in Command Line(Windows):
```
npm install
```

To setup BrowserSync, simply run the following command in Command Line (Windows):
```
npm install -g browser-sync
```
`npm install` calls the node package manager to install a package, `-g` tells it to install it globally so you can 
run it in any directory, and `browser-sync` is the name of the package. 

To run BrowserSync run the following command in the project directory:
```
browser-sync start --server --files "***/*"
```

`browser-sync start` starts BrowserSync, `--server` runs a local server using your current directory as the root and `--files '*'` tells BrowserSync the files it should watch for changes ('*' denotes watching all files). 

### Installing new NPM packages

When installing new packages add `--save` to include it in package.json, for example for jquery (already included)
```
npm install jquery --save
```