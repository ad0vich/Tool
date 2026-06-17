'use strict';

var License=(function(){
var API_URL='';
function quickCheck(){return true;}
function activate(key,callback){
if(typeof callback==='function')callback(null,{ok:true,plan:'standard'});
}
function check(callback){
if(typeof callback==='function')callback('valid');
}
function _vtag(){return null;}
function watch(){}
return{
'activate':activate,
'check':check,
'quickCheck':quickCheck,
'API_URL':API_URL,
'_vtag':_vtag,
'watch':watch
};
}());