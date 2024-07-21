/* eslint-disable linebreak-style */



function floatPadding(x) {
  return Number.parseFloat(x).toFixed(4);
}



function toHHMMSS (seconds) {
  var date = new Date(seconds * 1000);
  var hh = date.getHours();
  var mm = date.getMinutes();
  var ss = date.getSeconds();
  // If you were building a timestamp instead of a duration, you would uncomment the following line to get 12-hour (not 24) time
  // if (hh > 12) {hh = hh % 12;}
  // These lines ensure you have two-digits
  if (hh < 10) {hh = "0"+hh;}
  if (mm < 10) {mm = "0"+mm;}
  if (ss < 10) {ss = "0"+ss;}
  // This formats your string to HH:MM:SS
  return hh+":"+mm+":"+ss;
}


const vscode = acquireVsCodeApi();
let ln = navigator.language.toLowerCase().includes('zh-cn') ? 1 : 0


// 用来统计的数据，udp服务存入数据， 

var g_plot_sec_data = {
  seconds:[],
  rps:[],        //每秒请求
  tps:[],        //每秒响应  
  tops:[],       //每秒超时
  eps:[],        //每秒错误
  respTimeSum:[],
  respTimeAvg:[],

};

// 最多显示多少秒内的统计
var g_plot_sec_data_max_length = 30;

// 汇总的统计数据
var stats_total_data = {};
var g_plot_total_data = [];


// 接收到一次统计报告消息，进行的处理
// 一条统计记录格式： 
// {"t": 1594287838, "rps": 100, "tps": 100, "respTimeSum": 0.0475, 
// "total": {"send": 1800, "recv": 1800, "0-100ms": 1795, "100-500ms": 5} }

function handle_worker_stats(rawMsg,remote){
  
  let stats = JSON.parse(rawMsg);

  // console.log(stats)

  // 实时显示的统计数据- 按秒

  function existAdd (tn,stats,idx){
    if (stats[tn] !== undefined) g_plot_sec_data[tn][idx] += stats[tn];
  }
  
  function nonexistAdd (tn,stats){
    g_plot_sec_data[tn].push(stats[tn] === undefined? 0:stats[tn])     
  }
  
  
  let secondTime = toHHMMSS(stats.t)
  let idx = g_plot_sec_data.seconds.indexOf(secondTime);
  // 如果当前秒的统计已经存在(表示另外一个Python压力服务数据已经记录)，加上本次统计
  if (idx>=0){
      
    existAdd('rps',stats,idx);
    existAdd('tps',stats,idx);
    existAdd('respTimeSum',stats,idx);
    existAdd('tops',stats,idx);
    existAdd('eps',stats,idx);

    if (stats.respTimeSum !== undefined){            
      let totalTime = g_plot_sec_data.respTimeSum[idx] + stats.respTimeSum;
      g_plot_sec_data.respTimeAvg[idx] = floatPadding(totalTime/g_plot_sec_data.tps[idx]);
    }

  }
  // 如果当前秒的统计 不存在，放入
  else{
    g_plot_sec_data.seconds.push(secondTime);

    nonexistAdd('rps',stats);
    nonexistAdd('tps',stats);
    nonexistAdd('respTimeSum',stats);
    nonexistAdd('tops',stats);
    nonexistAdd('eps',stats);

    g_plot_sec_data.respTimeAvg.push(
      stats.respTimeSum === undefined? 0: floatPadding(stats.respTimeSum/stats.tps));
  }

  // 统计表超过规定长度，
  if (g_plot_sec_data.seconds.length > g_plot_sec_data_max_length){
    // console.log('reach max')
    for (var key in g_plot_sec_data) {
        g_plot_sec_data[key].shift();            
      }
  }


  // 实时显示的统计数据- 总共
      

  let remoteaddr = `${remote.address}:${remote.port}`
  stats_total_data[remoteaddr] = stats.total

  g_plot_total_data.length = 0 // clear array
  for (const [remoteaddr, stats] of Object.entries(stats_total_data)) {

    let formated = JSON.stringify(stats)
    .split('{').join('').split('}').join('').split('"').join(' ')
    .split('send').join(['send', '发送'][ln]).split('recv').join(['recv', '接收'][ln])
    .split('timeout').join(['timeout', '超时'][ln]).split('error').join(['error', '错误'][ln])

    g_plot_total_data.push(
      `${remoteaddr}  ${['Total', '总计'][ln]} --  ${formated}`
      );
  }


}


  

window.onload = function(){

  
  let root = ReactDOM.createRoot(document.querySelector('main'));

  let element = React.createElement(Monitor)
  
  root.render(element);


}

class Monitor extends React.Component {
   
  constructor(props) {
    super(props);
    
    this.state ={
      
      listenPort : "unready",
      statsHubs:[],
      // [
      //   {url:'ws://192.168.5.33:8081',connected:false, editing:false},
      //   {url:'ws://127.0.0.1:8081',connected:false,editing:false}
      // ]
    }

    this.chart_xps = null;
    
  }
    

  componentDidMount() {  
    
    // Handle the message inside the webview

    window.addEventListener('message', event => {

      const message = event.data; // The JSON data our extension sent

      switch (message.type) {
        case 'udp_listen_port_open':
          this.setState({listenPort:message.listenPort})
          break;
        case 'stats_from_udp':
          handle_worker_stats(message.stats,message.remote)
          break;
        case 'stats_hubs_cfg_data':
          this.setState({statsHubs:message.data})
          break;
      }
    });

    if (this.state.listenPort === 'unready')
      vscode.postMessage({command: 'get_listen_port'})
    
    var ctx = document.getElementById('myChart').getContext('2d');
    this.chart_xps = new Chart(ctx, {
      type: 'line',
      data: {
        labels: g_plot_sec_data.seconds,  // x-axis
        datasets: [
          {
            label: ['RequestsPerSec', '每秒请求'][ln],
            yAxisID: 'y1',  // 使用左边的Y轴
            backgroundColor: 'green',
            borderColor: 'green',
            fill: false,
            data: g_plot_sec_data.rps,  
            borderWidth : 1,
            pointRadius : 3,
            // cubicInterpolationMode: 'monotone',
            // tension: 0.4
          },
          {
            label: ['ResponsesPerSec', '每秒响应'][ln],
            yAxisID: 'y1',  // 使用左边的Y轴
            backgroundColor: 'blue',
            borderColor: 'blue',
            fill: false,
            data:  g_plot_sec_data.tps,            
            borderWidth : 1,
            pointRadius : 3,
            // cubicInterpolationMode: 'monotone',
            // tension: 0.4
          },
          {
            label: ['TimeoutsPerSec', '每秒超时'][ln],
            yAxisID: 'y1',  // 使用左边的Y轴
            backgroundColor: 'purple',
            borderColor: 'purple',
            fill: false,
            data:  g_plot_sec_data.tops,            
            borderWidth : 1,
            pointRadius : 2,
            // cubicInterpolationMode: 'monotone',
            // tension: 0.4
          },
          {
            label: ['ErrorsPerSec', '每秒错误'][ln],
            yAxisID: 'y1',  // 使用左边的Y轴
            backgroundColor: 'red',
            borderColor: 'red',
            fill: false,
            data:  g_plot_sec_data.eps,             
            borderWidth : 1,
            pointRadius : 2,
            // cubicInterpolationMode: 'monotone',
            // tension: 0.4
          },
          {
            label: ['AvgRespTime(Right Y Axis)', '平均响应时长(右Y轴)'][ln],
            yAxisID: 'y2',  // 使用右边的Y轴
            backgroundColor: 'black',
            borderColor: 'black',
            fill: false,
            data:  g_plot_sec_data.respTimeAvg,    
            borderWidth : 1,
            pointRadius : 2,
            // cubicInterpolationMode: 'monotone',
            // tension: 0.4
          },
      ]
      },

      // Configuration options go here
      options: {
        responsive: true,
        // plugins: {
        //   title: {
        //     display: true,
        //     text: '动态统计图'
        //   },
        //   tooltip: {
        //     mode: 'index',
        //     intersect: false,
        //   }
        // },
        // animation : {
        //   // duration : 600, //多少毫秒完成动作
        //   easing: 'linear'
        // },
        // events: ['click'],
        // hover: {
        //   mode: 'nearest',
        //   intersect: true
        // },
        scales: {
          y1: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0
          }, 
          y2 : {
          type: 'linear',
          display: true,
          position: 'right',
          min: 0,
          suggestedMax : 0.5,
          }
        }
      }
    });

    
    this.interval = setInterval(
      () => {
        // 刷新 图表实时统计数据
        this.chart_xps.update();

        // 刷新 文字实时统计显示
        this.forceUpdate();
        
      },

      3000 //每隔3秒更新一次
    );

    // let outside tell me cfg settings
    vscode.postMessage({command: 'stats_hubs_get_cfg_req'})
  }


  componentWillUnmount() {
    clearInterval(this.interval);
  }

 
  connectToStatsHub(statsHub) {
      
    // web socket 调用
    const ws = new WebSocket(statsHub.url); // 比如 ws://localhost:8081 //,  {rejectUnauthorized: false}
    statsHub.wsSocket = ws
  
    ws.onopen = e=> {
      console.log('[open] connection with ws server: ' + statsHub.url);
      statsHub.connected = true
      this.forceUpdate()
      // ws.send('something---');
    };
  
    
    ws.onmessage = async e=>{
      // console.log('received: %s', data);
      let msg = ''
      if (e.data instanceof Blob) {        
        msg = await e.data.text()
      } 
      else {
        console.log("unknown data type from websocket ")
        return 
      }


      let parts  = msg.split('|',2)
      let addrPort = parts[0].split(':',2);
      let remote = {
        address: statsHub.url + '$ ' +addrPort[0],
        port : addrPort[1]
      }
      handle_worker_stats(parts[1],remote)
    };
  
    ws.onclose = e=>{
      statsHub.connected = false
      this.forceUpdate()
    };

    ws.onerror = error=>{
      console.log(error);
      vscode.postMessage({command: 'alert', 
        text:'websocket connecting failed! did you set the proxy in VS Code?'})
      // window.getElementById(#)
    };
  }

  disconnectWithStatsHub(statsHub) {
    
    const ws = statsHub.wsSocket
    ws.close()

    statsHub.connected = false
    this.forceUpdate()
  
  }

  updateStatsHubCfg(newData=undefined){
    if (newData === undefined) newData=this.state.statsHubs
    let hubs = newData.map(h=> { return {url:h.url}})
    vscode.postMessage({command: 'stats_hubs_updated', hubs:hubs})
  }


  render() {
    
   
  return (
    
    
  <>
    
    <div className='TitlePane'>
    
    <span>{['Recving-Stats Port', '接收统计信息端口'][ln]} : {this.state.listenPort}</span>

    <div style={{display:'flex', justifyContent:'flex-end', gap:'1rem'}}>

      <span className="btn" 
        onClick={()=>{vscode.postMessage({command: 'plot_stats'})}}>                                
      {['Plot Load Test Statistics', '压测数据作图'][ln]}</span>

      <span className="btn" 
        onClick={()=>{
        for (var key in g_plot_sec_data) {
          g_plot_sec_data[key].length = 0;
        }

        stats_total_data ={} // 清空 总量 统计数据

        this.forceUpdate();                          
        this.chart_xps.update();       
        
        }
        }>                                
      {['Clear', '清除'][ln]}</span>



      <span className="btn" 
        onClick={()=>{        
          this.state.statsHubs.push({url:'ws://192.168.5.33:28888',connected:false,editing:true})
          this.forceUpdate()
        }
      }>                                
      {['Add StatsHub', '添加 StatsHub'][ln]}</span>
      </div>
    </div>

    
    <div className='infoPane'>
    {/* 图表区域 */}
    <div className='chartPane'>
      <canvas id="myChart"></canvas>
      
      {
        this.state.statsHubs.length == 0? null:
        <div id="statsHubs" >
          <div style={{color:'#007acc',fontSize:'.9rem',marginBottom:'.9rem'}}> Stats Hubs</div>
          <div id="statsHub-list" >
          {this.state.statsHubs.map( (statsHub, index) =>
            <div key={index} className="statsHub-list-item" >
              {
                statsHub.editing? 
                <input value={statsHub.url}
                  onChange={e=>{
                    statsHub.url=e.target.value;
                    this.forceUpdate()
                  }}
                  onKeyDown={e=>{
                    if(e.key === 'Enter'){
                      statsHub.editing = false
                      this.forceUpdate()
                      this.updateStatsHubCfg()
                    }
                    // else if(e.key === "Escape") {
                    //   statsHub.editing = false
                    //   this.forceUpdate()
                    // }
                  }}              
                ></input>
                :
                <div className={statsHub.connected? "url url-active" :"url"}
                  onClick={e=>{
                    statsHub.editing = true
                    this.forceUpdate()
                  }}
                >{statsHub.url}</div>
              }
              
              <span className="btn-no-border" 
                onClick={e=>{
                  if (statsHub.connected)
                    this.disconnectWithStatsHub(statsHub)
                  else {
                    if(statsHub.editing){
                      statsHub.editing = false
                      this.forceUpdate()
                      this.updateStatsHubCfg()
                    }
                    this.connectToStatsHub(statsHub)
                  }               
                    
              }}> {statsHub.connected? ['Disconnect', '断开'][ln]:['Connect', '连接'][ln]}  </span>
              <span className="btn-no-border"
                onClick={e=>{
                  if (statsHub.connected)
                    statsHub.wsSocket.close()
                    // this.disconnectWithStatsHub(statsHub)

                  let newStatHubs = []
                  for (var i = 0; i < this.state.statsHubs.length; i++) {
                    if (i !== index) newStatHubs.push(this.state.statsHubs[i])
                  }
                
                  this.setState({statsHubs:newStatHubs})
                  this.updateStatsHubCfg(newStatHubs)
                }}
              >{['Delete', '删除'][ln]}</span>
            </div>
          )}
          </div>
        
        </div>
      }
      
      
    </div>

    {/* 文字区域 */}
    { g_plot_sec_data.seconds.length === 0 ? null:

    <>  

    {/* 总量数据 */}
    <div className='totalnumberPane'> 
      
      {g_plot_total_data.map( (stats, index) =>
      <p key={index} style={{fontSize:'1em',margin:'0'}} >
        {stats}
      </p>
      )}

    </div>

    {/* 每秒数据 */}
    <div className='statsPane'> 
      

      <div className='statsPane_col'>
        <span key={1000} className='statsPane_col_item'>
        {['Time\\Number', '时间'][ln]}
        </span>
        
        {g_plot_sec_data.seconds.slice(0).reverse().map( (data, index) =>
        <span key={index} className='statsPane_col_item'>
          {data}
        </span>
        )}
      </div>


      <div className='statsPane_col'>
        <span key={1000} className='statsPane_col_item'>
        {['Requets', '请求数'][ln]}
        </span>
        {g_plot_sec_data.rps.slice(0).reverse().map( (data, index) =>
        <span key={index} className='statsPane_col_item'>
          {data}
        </span>
        )}
      </div>

      <div className='statsPane_col'>
        <span key={1000} className='statsPane_col_item'>
        {['Responses', '响应数'][ln]}
        </span>
        {g_plot_sec_data.tps.slice(0).reverse().map( (data, index) =>
        <span key={index} className='statsPane_col_item'>
          {data}
        </span>
        )}
      </div>

      <div className='statsPane_col'>
        <span key={1000} className='statsPane_col_item'>
        {['Timeouts', '超时数'][ln]}
        </span>
        {g_plot_sec_data.tops.slice(0).reverse().map( (data, index) =>
        <span key={index} className='statsPane_col_item'>
          {data}
        </span>
        )}
      </div>

      
      <div className='statsPane_col'>
        <span key={1000} className='statsPane_col_item'>
        {['Errors', '错误数'][ln]}
        </span>
        {g_plot_sec_data.eps.slice(0).reverse().map( (data, index) =>
        <span key={index} className='statsPane_col_item'>
          {data}
        </span>
        )}
      </div>

      
      <div className='statsPane_col'>
        <span key={1000} className='statsPane_col_item'>
        {['Avg Resp Time', '平均响应时间'][ln]}
        </span>
        {g_plot_sec_data.respTimeAvg.slice(0).reverse().map( (data, index) =>
        <span key={index} className='statsPane_col_item'>
          {data}
        </span>
        )}
      </div>

      

    </div>

    </>
    }
    </div>

  </>


  );
  }




}




