require("../css/styles.scss");
var $ = jQuery = require("jquery");
var _ = require("underscore")
var d3 = require("d3")
require('jquery-ui/slider.js')
require('jquery-ui-touch-punch/jquery.ui.touch-punch.min.js')

var add_details_temp = _.template($('#cal-add-details-template').html())

d3.csv("//media.dhb.io/projects/2016/debt-calculator/data/schooldata_clean.csv", function(error, data) {
    var nationalaverage = 28950

    var maxmeterval = d3.max(data, function(d){
                if (d.fa_loans_debt_avg_d.match(/[0-9]/g)){
                    return parseInt(d.fa_loans_debt_avg_d)
                }
            })

    var meterValues = {
        school_average: 0,
        school_average_percentage: 0,
        personal_debt: 0,
        personal_debt_percentage: 0,
        my_debt: 0,
        my_debt_percentage: 0,
        my_interest:0,
        my_interest_percentage:0,
        my_debt_main: 0,
        my_debt_main_percentage: 0,
        national_average: nationalaverage,
        national_average_percentage: getpercentage(nationalaverage,maxmeterval),
        mydebt_comparison: 0,
        mydebt_school_comparison:0,
        active_school:'',
        removenegative: function (e){
            return e.toString().replace('-','')
        }
    }

    $( "#cal-monthpay-slider" ).slider({
        max: 500,
        min:0,
        step:5,
        value:0,
        slide: function(event, ui) { 
            calculateloan (ui.value)
            if (ui.value>0){
                $('.cal-time-text').html("+ "+ui.value+"%")
            } else{
                $('.cal-time-text').html('No increase')
            }
        } 
    })

    calculateloan ()

    $('.cal-search--autocomplete').keyup(function(){
    var text = $(this).val()
        if (text!=''){
            typeahead(text,data)
        } else {
            doMath()
            calculateloan()
            typeahead()
        }
    })

    $('.cal-search--autocomplete').on('search',function(){
    var text = $(this).val()
        if (text==''){
            doMath()
            calculateloan()
            typeahead()
        }
    })

    $('#cal-adddetails').on('click',function(){
        $('.cal-loan-detail-bottom-box').append(add_details_temp)
         calculateloan()
    })

    $(document).on("click",'.cal-details-remove', function(){
        $(this).parent().parent().remove()
        calculateloan()
    })

    $('.cal-time-text').html('<span class = "cal-error">No increase</span>')
    $('.cal-nationalaverage .cal-result-num').html(justFormatnumber(nationalaverage))
    $('.cal-move-nationaldebt').css({"left":meterValues.national_average_percentage+'%'})

    $(document).on("change",'.cal-textbox.cal-currency', function(){
        var text = $(this).val()
        text = formatNumber(text)
        if (!text.match(/^\$/g)&& text != ''){
            $(this).val('$'+text)
        }
        calculateloan ()
    })

    $(document).on("change",'.cal-textbox.cal-percentage', function(){
        var text = $(this).val()
        if (text!=''){
            text = precise_round(parseFloat(text.replace(/%/g,'')),2)
            $(this).val(text+'%')
        }
        calculateloan ()
    })

    $(document).on("change",'.cal-textbox.cal-loanterm', function(){
        calculateloan ()
    })

    $(document).on('click','.cal-filterbox--results li',function() {
        $('.cal-search--autocomplete').prop('value',$(this).text());
        $('.cal-filterbox--typeahead').removeClass("filterbox--filled");
        $('.cal-filterbox--results').html('');
        var selectedobj = (_.findWhere(data,{ID:$(this).attr('data-which')}))
        doMath(selectedobj)
        calculateloan ()
    })

    function calculateloan (e){
        var sliderval = $('#cal-monthpay-slider').slider("option","value")
        var loanlist = ($('.cal-textbox.cal-loanamount'));
        var intlist = ($('.cal-textbox.cal-interestrate'));
        var termlist = ($('.cal-textbox.cal-loanterm'));
        var loandata = [];

        for (var i = 0; i < loanlist.length ; i++){
            var obj = {}
            if (!isNaN(loanlist[i].value.replace(/,/g,'').replace('$',''))){
                obj.P = parseInt(loanlist[i].value.replace(/,/g,'').replace('$',''))
            }
            if ( !isNaN( intlist[i].value.replace( /%/g,'' )/1200)){
                obj.r = parseFloat(intlist[i].value.replace(/%/g,''))/1200
            }

            if (!isNaN(termlist[i].value)){
                obj.t = parseInt(termlist[i].value)
                obj.tcal = obj.t * 12
            } else {
                obj.t = 0
            }

            if (obj.P && obj.r && obj.t){
                obj.monthlypay = monthlyPayment(obj.P,obj.tcal,obj.r)
                if (e>0 || sliderval>0){
                    if (e){
                        obj.monthlypay = Math.round(obj.monthlypay + (obj.monthlypay * e/100))
                    } else {
                        obj.monthlypay = Math.round(obj.monthlypay + (obj.monthlypay * sliderval/100))
                    }
                    // obj.monthlypay = 0
                    var timedata = timefrommonthlypay(obj.P,obj.r,obj.monthlypay)
                    obj.tcal = timedata.months
                    obj.interest = Math.round(timedata.totalint)
                    obj.debt = obj.P + obj.interest

                    if (e == 0){
                        obj.tcal = obj.t * 12
                        obj.monthlypay = monthlyPayment(obj.P,obj.tcal,obj.r)
                        obj.debt = obj.monthlypay*obj.tcal
                        obj.interest = obj.debt - obj.P
                    }
                } else if (!e || e==0){
                    obj.tcal = obj.t * 12
                    obj.monthlypay = monthlyPayment(obj.P,obj.tcal,obj.r)
                    obj.debt = obj.monthlypay*obj.tcal
                    obj.interest = obj.debt - obj.P
                }

                loandata.push(obj)
            }
        }
        // if (!e && sliderval==0){
            var monthlytime_list = _.chain(loandata)
                                .filter(function(e){return e.debt>0})
                                .pluck('tcal')
                                .uniq()
                                .value()
                                .sort(compareNumbers)

            var monthlydata = []

            monthlytime_list.forEach(function(f){
                
                    var obj = {
                        time: f
                    }

                    obj.monthlypay = d3.sum(
                        _.chain(loandata)
                        .where({'tcal':f})
                        .pluck('monthlypay')
                        .value()
                    )

                    monthlydata.push(obj)

            })

            var final_monthlydata = [], myvar=0
            if (monthlytime_list.length>0){
                do{
                    for (var g = 0; g < monthlydata.length ; g++){
                        if (monthlydata[g].time>0){
                            var yeartotal = 0
                            var currentyear = monthlydata[g].time
                            for (var j = 0; j < monthlydata.length ; j++){
                                if( monthlydata[j].time>0){
                                    yeartotal+= monthlydata[j].monthlypay
                                    monthlydata[j].time -= currentyear
                                }
                            }
                            myvar = 0
                            var yearobj = {
                                'year':currentyear,
                                'money':yeartotal
                            }
                            final_monthlydata.push(yearobj)
                        } else {
                            myvar = 1
                        }
                    }
                } while(myvar==0)
            }
            

             var maxyears = d3.max(monthlytime_list)
        // }
       

        if ((loandata.length==intlist.length) && (loandata.length==termlist.length) && (loanlist.length==loandata.length)){
            meterValues.my_debt_main = d3.sum(_.pluck(loandata,'P'))
            $('.cal-yourdebt-main .cal-result-num').html(justFormatnumber(meterValues.my_debt_main))
            meterValues.my_interest = d3.sum(_.pluck(loandata,'interest'))
            $('.cal-yourinterest .cal-result-num').html(justFormatnumber(meterValues.my_interest))
            meterValues.my_debt = d3.sum(_.pluck(loandata,'debt'))
            $('.cal-yourdebt .cal-result-num').html(justFormatnumber(meterValues.my_debt))
            $('.cal-error.cal-narrative').html('')
            $('.cal-narrative-group').removeClass('cal-hide')
            $('.cal-narrative.cal-narrative-month').html(monthlypaytextgen(final_monthlydata,maxyears))
        } else {
            $('.cal-narrative-group').addClass('cal-hide')
            var errortext = 'Please enter valid values'
            $('.cal-yourdebt-main .cal-result-num, .cal-yourinterest .cal-result-num, .cal-yourdebt .cal-result-num, .cal-error.cal-narrative').html('<span class = "cal-error">'+errortext+'</span>')
        }

        meterValues.my_debt_percentage = getpercentage(meterValues.my_debt , maxmeterval)
        meterValues.mydebt_comparison = Math.round(((meterValues.my_debt_main - nationalaverage)/nationalaverage)*100)
        meterValues.mydebt_school_comparison = Math.round(((meterValues.my_debt_main - meterValues.school_average)/meterValues.school_average)*100)
        meterValues.my_debt_main_percentage = (meterValues.my_debt_main/meterValues.my_debt )*100
        meterValues.my_interest_percentage = (meterValues.my_interest/meterValues.my_debt) *100
        $('.cal-bar.cal-persondebt').css({"max-width":meterValues.my_debt_percentage+'%'})
        $('.cal-persondebt-main').css({"max-width":meterValues.my_debt_main_percentage+'%'})
        $('.cal-persondebt-int').css({"max-width":meterValues.my_interest_percentage+'%'})
        recalibrate()
                var national_result_temp = _.template("<%if (mydebt_comparison < -3 | mydebt_comparison > 3){ %> Your <span class = 'cal-principal'>principal loan</span> is <% if (mydebt_comparison>0){%><span class = 'cal-comparison_percent cal-higher'><%= mydebt_comparison %>% higher</span><% } else { %> <span class = 'cal-comparison_percent cal-lower'><%= removenegative(mydebt_comparison) %>% lower</span><%}%> than the national average.<% } else {%>Your <span class = 'cal-principal'>principal loan</span> is <b>about the same</b> as the national average.<%}%>")
        var school_result_temp = _.template("<% if (active_school!=''){%>It is also <%if (mydebt_school_comparison < -3 | mydebt_school_comparison > 3){ %><% if (mydebt_school_comparison>0){%><span class = 'cal-comparison_percent cal-higher'><%= mydebt_school_comparison %>% higher</span><% } else { %> <span class = 'cal-comparison_percent cal-lower'><%= removenegative(mydebt_school_comparison) %>% lower</span><%}%> than<% } else {%><b>about the same</b> as <%}%> the average debt for <%=active_school%>.<%}%>")
                $('.cal-narrative-national').html(national_result_temp(meterValues))
        $('.cal-narrative-school').html(school_result_temp(meterValues))
    }

    function monthlypaytextgen(list,maxyears){
        if (list.length>1){
            var text = "It will take you <b>"+decipheryear(maxyears)+"</b> to pay off all your debt.";
            for (var g = 0; g < list.length ; g++){
                var dummy

                if (g==0 && list.length>1){
                    dummy = " You will pay <b>"+justFormatnumber(list[g].money)+'</b> every month for the first <b>'+decipheryear(list[g].year)+"</b>."
                    
                } else if (g==1){
                    dummy = ' For the next <b>'+decipheryear(list[g].year)+'</b> you will have a monthly payment of <b>'+justFormatnumber(list[g].money)+'</b>.'
                } else if (g==list.length-1){
                    dummy = " After that you'll ultimately head towards the final lap! You will pay <b>"+justFormatnumber(list[g].money)+ '</b> per month for the final <b>'+decipheryear(list[g].year)+'</b> to clear your debt.'
                } else {
                    dummy = " Your monthly payment for the next <b>"+decipheryear(list[g].year)+'</b> will be <b>'+justFormatnumber(list[g].money)+'</b>.'
                }
                text = text+dummy
            }
        } else {
            var text = 'You would be paying <b>'+justFormatnumber(list[0].money)+'/month</b> for <b>'+decipheryear(list[0].year)+'</b> to clear your debt.'
        }
        
        return(text)
    }

    function decipheryear(e){
        if (e % 12 == 0){
            if (parseInt(e/12)>1){
                return e/12 + ' years'
            } else if (e/12==1){
                return '1 year'
            }
        } else {
            if (parseInt(e/12)>1){
                if (e % 12 > 1){

                    return parseInt(e/12) + ' years and '+e%12+" months" 
                } if (e % 12 == 1){
                    return parseInt(e/12) + ' years and 1 month' 

                }
            } else if (parseInt(e/12)==1){
                if (e % 12 > 1){

                    return parseInt(e/12) + ' year and '+e%12+" months" 
                }
                if (e % 12 == 1){
                    return parseInt(e/12) + " year and 1 month"
                }
            }else {
                if (e % 12 > 1){
                    return +e%12+" months" 

                } else if (e % 12 == 1){
                    return " 1 month" 
                }
            

            }
        }
            
    }

    function precise_round(num, decimals) {
        var t=Math.pow(10, decimals);   
         return (Math.round((num * t) + (decimals>0?1:0)*(Math.sign(num) * (10 / Math.pow(100, decimals)))) / t).toFixed(decimals);
    }


    function formatNumber(x) {
        x = x.replace(/,/g,'').replace('$','')
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function justFormatnumber(x){
        return '$'+x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function getpercentage(e,f){
        return Math.round(parseInt(e)/parseInt(f) *100)
    }

    function typeahead (search, list) {
        if (list && list.length > 0) {
            searchString = new RegExp(search,'i');
            var results = _.map(list, function(val) {
                if (val.name.match(searchString)){
                    return '<li role="button"class = "schoolopt" data-which = "'+val['ID']+'">' + val.name.replace(searchString, '<span>$&</span>') + '</li>';
                }
            });
            $('.cal-schoolsearch-container').addClass("filterbox--filled");
            $('.cal-filterbox--results').html(results);
        } else {
            $('.cal-schoolsearch-container').removeClass("filterbox--filled");
            $('.cal-filterbox--results').html('');
            recalibrate()
        }
    }

    function doMath(e){
        if (e && e.fa_loans_debt_avg_d.match(/[0-9]/g)){
            meterValues.school_average = parseInt(e.fa_loans_debt_avg_d)
            meterValues.active_school = e.name
            $('.cal-schoolaverage .cal-result-num').html(justFormatnumber(meterValues.school_average))
            meterValues.school_average_percentage = getpercentage (meterValues.school_average,maxmeterval)
            $('.cal-schoolaverage.cal-bar').css({"max-width":meterValues.school_average_percentage+'%'})
        } else {
            meterValues.school_average = 0
            meterValues.school_average_percentage = 0
            meterValues.active_school = ''
        }
    }

    function compareNumbers(a, b){
        return a - b;
    }

    function monthlyPayment(p, n, i) {
          return Math.round(p * i * (Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1));
    }

    function timefrommonthlypay(p, i, m){
        
        var stuff = {
            totalint: 0,
            months: 0
        }

        while ( p > 0 ){
            var interest = i * p;
            stuff.totalint = (stuff.totalint + interest);
            p += interest;
            stuff.months++;
            p -= m;
        }

        stuff.totalint = Math.round(stuff.totalint)
        return stuff
    }


    function recalibrate(){
        maxmeterval = d3.max([d3.max(data, function(d){
            if (d.fa_loans_debt_avg_d.match(/[0-9]/g)){
                return parseInt(d.fa_loans_debt_avg_d)
            }
        }),meterValues.my_debt])

        if (meterValues.my_debt>0){
            meterValues.my_debt_percentage= getpercentage(meterValues.my_debt, maxmeterval)
        }

        if (meterValues.school_average>0){

            meterValues.school_average_percentage= getpercentage (meterValues.school_average,maxmeterval)

        } else{

            $('.cal-schoolaverage .cal-result-num').html('<span class = "cal-error">Not available</span>')

        }

        meterValues.nationalaverage_percentage = getpercentage(meterValues.national_average,maxmeterval)
        $('.cal-persondebt.cal-bar').css({"max-width":meterValues.my_debt_percentage+'%'})
        $('.cal-schoolaverage.cal-bar').css({"max-width":meterValues.school_average_percentage+'%'})
        $('.cal-move-nationaldebt').css({"left":meterValues.nationalaverage_percentage+'%'})
    }
    
})