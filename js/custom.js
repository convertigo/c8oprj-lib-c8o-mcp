(function () {
  "use strict";
  var statusPanel=document.getElementById("status-panel"),statusText=document.getElementById("status-text");
  var adminContent=document.getElementById("admin-content"),tokenList=document.getElementById("token-list");
  var emptyState=document.getElementById("empty-state"),tokenCount=document.getElementById("token-count");
  var endpointLabel=document.getElementById("endpoint-label"),createForm=document.getElementById("create-form");
  var createButton=document.getElementById("create-button"),secretPanel=document.getElementById("secret-panel");
  var tokenSecret=document.getElementById("token-secret");

  function resultOf(payload){
    if(payload&&payload.result)return payload.result;if(payload&&payload.Result)return payload.Result;
    if(payload&&payload.document&&payload.document.result)return payload.document.result;return payload||{};
  }
  async function callSequence(sequence,variables){
    var body=new URLSearchParams();body.set("__sequence",sequence);
    Object.keys(variables||{}).forEach(function(key){body.set(key,variables[key]);});
    var response=await fetch(".json",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:body.toString()});
    var payload=await response.json();
    var responseError=payload&&payload.error||payload&&payload.document&&payload.document.error;
    if(!response.ok||responseError)throw new Error(responseError&&responseError.message||"La requete a echoue.");
    return resultOf(payload);
  }
  function setStatus(message,state){statusText.textContent=message;statusPanel.className="status-panel"+(state?" "+state:"");}
  function formatDate(value){
    if(!value)return"jamais";var date=new Date(value);
    return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(date);
  }
  function renderTokens(tokens){
    tokenList.replaceChildren();tokens=Array.isArray(tokens)?tokens:[];tokenCount.textContent=String(tokens.length);emptyState.hidden=tokens.length!==0;
    tokens.forEach(function(token){
      var fragment=document.getElementById("token-template").content.cloneNode(true),row=fragment.querySelector(".token-row");
      var status=token.status||"active";row.classList.toggle("revoked",status==="revoked");row.classList.toggle("inactive",status!=="active");
      fragment.querySelector(".token-name").textContent=token.name||token.id;
      var statusNode=fragment.querySelector(".token-status");statusNode.textContent=status==="revoked"?"Revoque":status==="expired"?"Expire":"Actif";statusNode.classList.toggle("revoked",status!=="active");
      fragment.querySelector(".token-meta").textContent="Cree le "+formatDate(token.createdAt)+" · expire le "+formatDate(token.expiresAt)+" · derniere utilisation "+formatDate(token.lastUsedAt);
      var revokeButton=fragment.querySelector(".revoke-button");revokeButton.addEventListener("click",function(){revokeToken(token.id,revokeButton);});
      tokenList.appendChild(fragment);
    });
  }
  async function loadStatus(){
    setStatus("Verification de la session...","");
    try{
      var result=await callSequence("McpAdminStatus",{});
      if(result.authorized!==true&&String(result.authorized)!=="true")throw new Error(result.error&&result.error.message||"Une session WEB_ADMIN est requise.");
      adminContent.hidden=false;endpointLabel.textContent=result.mcpUrl||"";renderTokens(result.tokens);
      setStatus("Session administrateur active. Les secrets sont stockes dans le workspace Convertigo.","ok");
    }catch(error){adminContent.hidden=true;setStatus(error.message||String(error),"error");}
  }
  async function createToken(event){
    event.preventDefault();createButton.disabled=true;
    try{
      var result=await callSequence("McpTokenCreate",{name:document.getElementById("token-name").value,expiresInDays:document.getElementById("token-days").value});
      if(result.status!=="ok"||!result.token)throw new Error(result.error&&result.error.message||"Le jeton n'a pas pu etre cree.");
      tokenSecret.textContent=result.token;secretPanel.hidden=false;renderTokens(result.tokens);createForm.reset();document.getElementById("token-days").value="365";
      setStatus("Jeton cree. Copiez son secret avant de fermer le bloc.","ok");
    }catch(error){setStatus(error.message||String(error),"error");}finally{createButton.disabled=false;}
  }
  async function revokeToken(tokenId,button){
    button.disabled=true;
    try{
      var result=await callSequence("McpTokenRevoke",{tokenId:tokenId});
      if(result.status!=="ok")throw new Error(result.error&&result.error.message||"La revocation a echoue.");
      renderTokens(result.tokens);setStatus("Jeton revoque. Les prochaines requetes seront refusees.","ok");
    }catch(error){button.disabled=false;setStatus(error.message||String(error),"error");}
  }
  document.getElementById("refresh-button").addEventListener("click",loadStatus);createForm.addEventListener("submit",createToken);
  document.getElementById("copy-button").addEventListener("click",async function(){await navigator.clipboard.writeText(tokenSecret.textContent);setStatus("Jeton copie dans le presse-papiers.","ok");});
  document.getElementById("dismiss-secret").addEventListener("click",function(){tokenSecret.textContent="";secretPanel.hidden=true;});
  loadStatus();
})();
