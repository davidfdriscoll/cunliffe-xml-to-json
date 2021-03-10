var fs = require('fs');
    xml2js = require('xml2js');
    strip_tags = require('locutus/php/strings/strip_tags');

/* one problem is dealing with html-like use of tags like <gloss>
see discussion at https://github.com/Leonidas-from-XIV/node-xml2js/issues/283 */
var parser = new xml2js.Parser({includeWhiteChars: 'true',charsAsChildren: 'true',explicitChildren: 'true',preserveChildrenOrder: 'true'});
const allowed_tags = '<TEI><text><body><head><div><p><gloss><quote><bibl><term>'

var toSuperscript = function(text) {
    // looks for Greek character, non white space, then number
    // misses things like μετα- 6, so could be improved
    const superscriptTest = /[\u0370-\u03ff\u1f00-\u1fff]\S+([0-9])/g;
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
    function wordToSuperscript(str, p1, offset) {
      return(str.substring(0, str.length - 1) + superscriptDict.get(p1));
    }
    return text.replace(superscriptTest, wordToSuperscript);
}

var pToTextArray = function(para) {
  // takes a p obj from the JSON and iterates over it, evaluating each of its children.
  // It creats an object consisting of a textType and text
  // to the array of a TextArray object with a tag

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
  return {type: 'textArray', data: newPara};
}

var parseWord = function(oldWord) {
  let newWord = {}
  newWord.headword = oldWord.head[0]['_'];
  newWord.etym = [];
  newWord.forms = [];
  newWord.defs = {type: 'definition', data: []};

  console.log(newWord.headword);

  // This loop goes over the p's that exist before the definition divs; it is possible for 
  // them to include information on etymology, forms, and definitions, and this loop
  // makes a half-hearted effort to sort the p's accordingly. It should be revised to preserve order.
  if(Array.isArray(oldWord.p) && oldWord.p.length > 0) {
    oldWord.p.forEach(pItem => {   
      if(Array.isArray(pItem['$$']) && pItem['$$'].length > 0) {
        let newTextArray = pToTextArray(pItem);
        if (newTextArray.data[0].textType === 'term') {
          newWord.forms.push(newTextArray);  
        }
        else if (newTextArray.data[0].text[0] === '[' || newTextArray.data[0].text[0] === '-' || newTextArray.data[0].text[0] === '(') {
          newWord.etym.push(newTextArray);   
        }
        else {
          newWord.defs.data.push({type: 'meaning', data:[newTextArray]});
        }
      }      
    });
  }

  // This loop goes over the divs that contain definition information.  
  
  if(Array.isArray(oldWord.div) && oldWord.div.length > 0) {
    oldWord.div.forEach(divItem => {
      let newMeaning = {type: 'meaning', data: []};
      if(divItem.head) {
        newMeaning['head'] = divItem.head[0]['_'];
      } 
      if(Array.isArray(divItem.p) && divItem.p.length > 0) {
        divItem.p.forEach(pItem => {
          newMeaning.data.push(pToTextArray(pItem));
        });
      }
      if(newMeaning.head || newMeaning.data.length > 0) {
        newWord.defs.data.push(newMeaning);
      }
    });
  }
  if (newWord.defs.data.length === 0) delete newWord.defs;
  return newWord;
}

var convertFile = function(file) {
  fs.readFile('./input/' + file, 'utf8', function(err, data) {
    // remove extraneous tags like <foreign>, & superscript numbers at ends of Greek words
    data = strip_tags(data, allowed_tags);
    data = toSuperscript(data);

    parser.parseStringPromise(data).then(function (result) {

      // Execute conversion
      var oldWords = result.TEI.text[0].body[0].div;
      let words = [];
      for(let oldWord of oldWords) {
        words.push(parseWord(oldWord));
      }

      // Log to console
      console.log(oldWords);
      console.log(words);

      /// Write to JSON file
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