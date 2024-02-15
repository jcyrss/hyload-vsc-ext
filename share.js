const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const child_process = require('child_process');
let g_cfgFilePath = undefined

let g={
  cfgModel:{}, // project cfg file model data
  context:undefined
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
  
function makeDirSync(dir) {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}

function makeFileSync(filename) {
  if (!fs.existsSync(filename)) {
      makeDirSync(path.dirname(filename));
      fs.createWriteStream(filename).close();
  }
}


async function getPythonPath(){
  // Extension writers can provide APIs to other extensions
  // by returning their API public surface from the activate-call.
  // 参考 https://code.visualstudio.com/api/references/vscode-api#extensions
  try{
    const extension = vscode.extensions.getExtension('ms-python.python');
    if (!extension.isActive) {
        await extension.activate();
    }
  
    // 参考 https://github.com/microsoft/vscode-python/blob/main/src/client/apiTypes.ts
    const pythonPath = await extension.exports.environments.getActiveEnvironmentPath();
    return pythonPath.path
  }
  catch {
    vscode.window.showWarningMessage('Please set Python interpret for the project');
    return null
  }
}


function getHtmlForWebview(panel, context, fileName){
  // refer to https://stackoverflow.com/q/56182144/2602410
  let content = fs.readFileSync(
    path.join(context.extensionPath,'webviews',fileName), 
    'utf8'
  )
  content = content.replaceAll(
    '$webview-dir$', 
    panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webviews'))
  )
  
  return content
}

function randomStr(length){

  var result           = '';
  var characters       = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;

}


// if terminal exists, reuse it, otherise, open new one.
function getTheTerminal(terminalName){

  for (let t of vscode.window.terminals){
    if (t.name===terminalName){
      t.show(true)
      return t
    }
  }
  let terminal = vscode.window.createTerminal(
    terminalName, process.env.COMSPEC);
  
  terminal.show(true)

  return terminal
}


function runCmdInNewTerminal(terminalName,cmd){
  
  let terminal = vscode.window.createTerminal(
    terminalName, process.env.COMSPEC);
  
  terminal.show(true)

  terminal.sendText(cmd)

  return terminal
}


function runCmdInTheTerminal(terminalName, cmd){
  
  let terminal = getTheTerminal(terminalName)
            
  terminal.sendText(cmd)

  return terminal
}


// use the same terminal to run python command
async function runPythonCmdInTheTerminal(terminalName,cmd){
  
  let terminal = getTheTerminal(terminalName)
        
  const pythonPath = await getPythonPath()

  if (!pythonPath){
    vscode.window.showInformationMessage('Please set Python interpret for the project')
    return
  }
  
  cmd = `"${pythonPath}" ` + cmd
  terminal.sendText(cmd)

  return terminal
}

// open new terminal to run python command
async function runPythonCmdInNewTerminal(terminalName,cmd){

  let terminal = vscode.window.createTerminal(
    terminalName ,process.env.COMSPEC);
  
  terminal.show(true)
  
  const pythonPath = await getPythonPath()
  if (!pythonPath){
    vscode.window.showInformationMessage('Please set Python interpret for the project')
    return
  }
  
  cmd = `"${pythonPath}" ` + cmd
  terminal.sendText(cmd)

  return terminal
}

// return [exitCode, output]
async function runPythonCmdInNewProcess(cmd){
  
        
  const pythonPath = await getPythonPath()

  if (!pythonPath){
    vscode.window.showInformationMessage('Please set Python interpret for the project')
    return 
  }
  
  cmd = `"${pythonPath}" ` + cmd

  try{
    return [0, child_process.execSync(cmd).toString()]
  }catch (err){ 
    let errStr = err.stderr.toString()
    // console.log("output", err)
    console.log("sdterr",errStr)
    return [err.status , errStr]
  }
}

function getCfgPath(){
  if (g_cfgFilePath) return g_cfgFilePath
  
  const projectFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath
  return path.join(projectFolderPath,'hyload-cfg.json')

}

function loadCfgModel(){
  
  try{
    g.cfgModel = JSON.parse(fs.readFileSync(getCfgPath()))
  }
  catch(e){
    console.log(e.name,e.message)   
    g.cfgModel = {}
  }
  
}

function updateCfgFile(entryName, data){
  g.cfgModel[entryName] = data 
  fs.writeFileSync(getCfgPath(),JSON.stringify(g.cfgModel,null,2))
}


module.exports = {
  g,
  sleep,
  makeDirSync,
  makeFileSync,
  getHtmlForWebview,
  runCmdInTheTerminal,
  runCmdInNewTerminal,
  runPythonCmdInTheTerminal,
  runPythonCmdInNewTerminal,
  runPythonCmdInNewProcess,
  loadCfgModel,
  updateCfgFile
}