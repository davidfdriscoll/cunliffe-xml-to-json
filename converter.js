var fs = require('fs');
    xml2js = require('xml2js');
    strip_tags = require('locutus/php/strings/strip_tags');

/* one problem is dealing with html-like use of tags like <gloss>
see discussion at https://github.com/Leonidas-from-XIV/node-xml2js/issues/283 */
var parser = new xml2js.Parser({includeWhiteChars: 'true',charsAsChildren: 'true',explicitChildren: 'true',preserveChildrenOrder: 'true'});
var allowed_tags = '<TEI><text><body><head><div><p><gloss><quote><bibl><term>'

const superscriptDict = new Map([
  ['0', '⁰'],
  ['1', '¹'],
  ['2', '²'],
  ['3', '³'],
  ['4', '⁴'],
  ['5', '⁵'],
  ['6', '⁶'],
  ['7', '⁷'],
  ['8', '⁸'],
  ['9', '⁹']
]);

var handleP = function(para) {
  let newPara = [];
  for(let i = 0; i<para['$$'].length; i++) {
    const textObj = para['$$'][i];
    let newTextObj = {};
    newTextObj.text = textObj['_'];
    if(textObj['#name'].includes('text')) {
      const prevObj = para['$$'][i-1];
      if(prevObj && prevObj['#name'].includes('bibl')) newTextObj.textType = 'small_text';
      else if (prevObj && prevObj['#name'].includes('quote')) newTextObj.textType = 'small_text';
      else newTextObj.textType = 'text';
    }
    else if (textObj['#name'].includes('gloss')) {
      newTextObj.textType = 'gloss';
    }
    else if (textObj['#name'].includes('quote')) {
      newTextObj.textType = 'quote';
    }
    else if (textObj['#name'].includes('bibl')) {
      newTextObj.textType = 'bibl';
    }
    else if (textObj['#name'].includes('term')) {
      newTextObj.textType = 'term';
    }
    newPara.push(newTextObj);
  }
  return newPara;
}

var parseWord = function(oldWord) {
  let newWord = {}
  newWord.headword = oldWord.head[0]['_'];
  newWord.etym = [];
  newWord.forms = [];
  newWord.defs = [];

  console.log(newWord.headword);

  //likely there's a more elegant way to filter these arrays
  if(Array.isArray(oldWord.p) && oldWord.p.length > 0) {
    oldWord.p.forEach(pItem => {   
      if(Array.isArray(pItem['$$']) && pItem['$$'].length > 0) {
        let newPItem = handleP(pItem);
        if (newPItem[0].textType === 'term') {
          newWord.forms.push(newPItem);  
        }
        else if (newPItem[0].text[0] === '[' || newPItem[0].text[0] === '-') {
          newWord.etym.push(newPItem);   
        }
        else {
          newWord.defs.push(newPItem);
        }
      }      
    });
  }

  if(Array.isArray(oldWord.div) && oldWord.div.length > 0) {
    oldWord.div.forEach(divItem => {
      let newDef = [];
      if(divItem.head) newDef.push({textType: 'headNumber', text: divItem.head[0]['_']});
      if(Array.isArray(divItem.p) && divItem.p.length > 0) {
        divItem.p.forEach(pItem => {
          newDef.push(handleP(pItem));
        });
      }
      if(newDef.length > 0) newWord.defs.push(newDef);
    });
  }
  return newWord;
}

var convertFile = function(file) {
  fs.readFile('./input/' + file, 'utf8', function(err, data) {
    // remove extraneous tags like <foreign>
    var strippedOfTags = strip_tags(data, allowed_tags);
    console.log("stripped of tags");

    const superscriptTest = /[\u0370-\u03ff\u1f00-\u1fff]\S+([0-9])/g;
    function toSuperscript(str, p1, offset) {
      console.log(p1);
      console.log(str.substring(0, str.length - 1) + superscriptDict.get(p1));
      return(str.substring(0, str.length - 1) + superscriptDict.get(p1));
    }
    var superscriptNumbers = strippedOfTags.replace(superscriptTest, toSuperscript);
    console.log("to superscript");

    parser.parseStringPromise(superscriptNumbers).then(function (result) {
      var oldWords = result.TEI.text[0].body[0].div;
      let words = [];
      for(let oldWord of oldWords) {
        words.push(parseWord(oldWord));
      }
 //   console.log(oldWords);
 //   console.log(words);
      console.log("Done, now writing to file");
      var jsonString = JSON.stringify(words);
      var fileName = file.replace('.xml', '.json');
      fs.writeFile('./output/' + fileName, jsonString, function(err) {
        if (err) { throw err }
      });
    })
    .catch(function (err) {
      // Failed
      console.log("error!");
      console.log(err);
    });
 });
}

fs.readdir('./input', {encoding: 'utf8', withFileTypes: true}, function(err, files) {
  if (err) { throw err }
  files.map(function(file) {
    console.log(file.name);
    if(file.name !== '.DS_Store') convertFile(file.name);
  })
})