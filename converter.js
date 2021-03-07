var fs = require('fs');
    xml2js = require('xml2js');
    strip_tags = require('locutus/php/strings/strip_tags');
var parser = new xml2js.Parser();
var allowed_tags = '<TEI><text><body><head><div><p>'

var parseWord = function(oldWord) {
  let newWord = {}
  newWord.headword = oldWord.head[0];
  newWord.etym = [];
  newWord.forms = [];
  newWord.defs = [];

  //likely there's a more elegant way to filter these arrays
  if(oldWord.p) {
    oldWord.p.forEach(pItem => {
      if(pItem[0] === '[' || pItem[0] === '-') {
        newWord.etym.push(pItem);
      }
      else {
        newWord.forms.push(pItem);
      }
    });
  }

  if(oldWord.div) {
    const divDefReducer = (accumulator, currentValue) => accumulator + ' ' + currentValue;

    oldWord.div.forEach(divItem => {
      let combinedDef = "";
      if(divItem.head) combinedDef += '(' + divItem.head[0] + ') ';
      if(divItem.p) combinedDef += divItem.p.reduce(divDefReducer);
      if(combinedDef !== "") newWord.defs.push(combinedDef);
    });
  }
  return newWord;
}

var convertFile = function(file) {
  fs.readFile('./input/' + file, 'utf8', function(err, data) {
    var strippedOfTags = strip_tags(data, allowed_tags);
    parser.parseString(strippedOfTags, function (err, result) {
      var oldWords = result.TEI.text[0].body[0].div;
      var words = [];
      for(let oldWord of oldWords) {
        words.push(parseWord(oldWord));
      }
      var jsonString = JSON.stringify(words);
      var fileName = file.replace('.xml', '.json');
      fs.writeFile('./output/' + fileName, jsonString, function(err) {
        if (err) { throw err }
      })
    });
  });
}

fs.readdir('./input', {encoding: 'utf8', withFileTypes: true}, function(err, files) {
  if (err) { throw err }
  files.map(function(file) {
    convertFile(file.name);
  })
})