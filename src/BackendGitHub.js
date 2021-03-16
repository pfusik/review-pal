class BackendGitHub
{
    CLASS_JUMP = "cdm-jump-github";
    // #ms before we start analyzing diffs
    WAIT_DELAY = 500;

    constructor()
    {
        console.log("Initializing BackendGitHub");
    }

    deriveId()
    {
        let href = window.location.href;
        let m = href.match(/pull\/(.*)\/(files|commits)/);
        if (!m) {
            console.log("No id, exiting");
            return;
        }
        dmcore.id = m[1];
    }

    initBar()
    {
        let tb = $(".pr-toolbar");
        if (tb.length === 0) {
            console.error("Can't find pr-toolbar");
            return;
        }
        console.log("Adding bar");
        tb.append(`<div class="cdm-bar cdm-bar-github" id="${dmcore.barId}"/><br/>`);

        let bar = $("#"+dmcore.barId);
        bar.html(`
<span class="cdm-stats-github" id="${dmcore.statsId}">${dmcore.LABEL}</span>
<span class="cdm-toolbox">
  <!-- Blatantly copied -->
  <span class="cdm-button cdm-unfold-all" title="Unfold all files">
    <svg viewBox="0 0 10 16" version="1.1" width="10" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M5 11L0 6l1.5-1.5L5 8.25 8.5 4.5 10 6l-5 5z"></path></svg>
  </span>
  <span class="cdm-button cdm-fold-all" title="Fold all files">
    <svg viewBox="0 0 8 16" version="1.1" width="8" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M7.5 8l-5 5L1 11.5 4.75 8 1 4.5 2.5 3l5 5z"></path></svg>
  </span>

  <span class="cdm-button cdm-reset" title="Reload">
    reset
  </span>
</span>
<div class="cdm-message-github" id="${dmcore.messageId}"></div>
`);
        $("span.cdm-button").on("click", dmcore.buttonPressed.bind(dmcore));
    }

    updateStats(total, totalLines, done, doneLines, todo, todoLines)
    {
        let selections = "";
        for (let i = 0; i < dmcore.selections.length; i++) {
            let sel = dmcore.selections[i];
            selections += `<span class='cdm-selection-${sel.color}'>${sel.text}</span> `;
        }
        $("#" + dmcore.statsId).html(`
<table class="cdm-stats-table">
<tr>
    <th>Total:</th>
    <td>${total} diffs</td>
    <td>${totalLines} lines</td>
    <th>${dmcore.LABEL}</th>
</tr>
<tr style="background-color: #ccffcc">
    <th class="cdm-stats-done">Done</th>
    <td class="cdm-stats-text cdm-stats-done">${done} diffs</td>
    <td class="cdm-stats-text cdm-stats-done">${doneLines} lines</td>
    <th>
         <span class="cdm-button cdm-setAll" style="float-right"><img ${dmcore.greenHTML} width="20" height="20"/> Mark all done</span>
    </th>
</tr>
<tr style="background-color: #ffcccc">
    <th class="cdm-stats-todo">To do</th>
    <td class="cdm-stats-text cdm-stats-todo">${todo} diffs</td>
    <td class="cdm-stats-text cdm-stats-todo">${todoLines} lines</td>
    <th>
      <span class="cdm-button cdm-clearAll" style="float-right"><img ${dmcore.redHTML} width="20" height="20"/>Clear all</span>
    </th>
</tr>
<tr>
<td colspan="4">
${selections}
</td>
</tr>
</table>
`);

        $("span.cdm-button").off("click");
        $("span.cdm-button").on("click", dmcore.buttonPressed.bind(dmcore));
    }

    waitForDiff(callback)
    {
        dmcore.message("Waiting for data");
        this.waitCallback = callback;
        this.scheduledCall = null;
        this.scheduleLoadCompletion();
    }

    scheduleLoadCompletion()
    {
        dmcore.message("Data incoming");
        if (this.scheduledCall) {
            clearTimeout(this.scheduledCall);
        }
        this.scheduledCall = setTimeout(this.waitForDiffDone.bind(this), this.WAIT_DELAY);
    }

    waitForDiffDone()
    {
        $("#files").on("DOMNodeInserted", this.nodeInserted.bind(this));

        $("hide-file-notes-toggle").on("DOMNodeInserted", this.nodeInserted.bind(this));
        $("[data-hide-on-error]").on("DOMNodeRemovedFromDocument", this.fileLoaded.bind(this));

        this.waitCallback();
    }

    fileLoaded()
    {
        this.scheduleLoadCompletion();
    }

    nodeInserted(ev)
    {
        // this element seems to be the last one inserted
        if ($(ev.target).hasClass("js-diff-progressive-container")) {
            this.scheduleLoadCompletion();
        }
    }

    getRowRanges(row)
    {
        let left = Number($(row.cells[0]).attr("data-line-number")) || 0;
        let right = Number($(row.cells[2]).attr("data-line-number")) || 0;
        return [left, right];
    }

    isDiff(row)
    {
        let lval = row.cells[1];
        let rval = row.cells[3];
        return $(lval).hasClass("blob-code-deletion")
        || $(rval).hasClass("blob-code-addition");
    }

    analyzeDiffs()
    {
        dmcore.diffs = [];
        let diff = null;
        let parent = this;
        let path = null;

        /** Finish diff if needed */
        function finishDiff()
        {
            if (diff) {
                dmcore.diffs.push(diff);
                parent.updateDiff(diff, false/*updateFile*/);
                // Finish diff
                diff = null;
            }
        }

        let perHunk = function(index, row) {
            let diffLine = parent.createDiffLine(row);
            let isBreak = dmcore.data.breaks.indexOf(diffLine.id) >= 0;
            let isDiff = parent.isDiff(row);
            let first = (index === 0);

            if (!isDiff || isBreak || first) {
                finishDiff();
            }
            if (isDiff) {
                if (!diff) {
                    // New diff
                    diff = new DiffBlock(diffLine.tag);
                    diff.path = path;
                }
                // Update diff
                diff.addLine(diffLine);
            }
        };

        let perFile = function(index, row) {
            path = $(row).children().first().attr("data-path");
            console.log(`Analyzing ${path}`);
            let hunks = $(row).find("[data-hunk]");
            hunks.each(perHunk);
            finishDiff();
            parent.updateFile(path);
        };

        let files = $(".file");
        files.each(perFile);
    }

    updateFile(path)
    {
        // TODO: this is stupid slow, optimize!
        let done = 0, todo=0;
        // Sum all diffs for this file
        for (let d = 0; d < dmcore.diffs.length; d++) {
            let od = dmcore.diffs[d];
            if (od.path === path) {
                if (dmcore.isDone(od.getId())) {
                    done += od.getNumLines();
                } else {
                    todo += od.getNumLines();
                }
            }
        }
        // Find file header
        let header = $(`[data-path="${path}"]`);
        header.find(".cdm-github-per-file-stats").remove();
        let total = done + todo;
        let idAllDone = "fileSetAllDone_" + path;
        let idAllClear = "fileSetAllClear_" + path;
        let extraClass = (done == total) ? "all-done" : "";
        let stats = jQuery.parseHTML(`
<span class="cdm-github-per-file-stats ${extraClass}" 
  style="background: linear-gradient(90deg, #4f48 0%, #fff4 ${100 * done / total}%, #f448 100%);"
>
<img ${dmcore.greenHTML} title="Mark all diffs in file as done" width="20" height="20" data-alldone="${path}" />
<img ${dmcore.redHTML} title="Clear all diffs in file" width="12" height="12" data-allclear="${path}" />
Done: ${done} / ${total}
</span>
        `);
        header.find(".file-info").append(stats);
        $(`[data-alldone="${path}"]`).on("click", this.setAllPerFile.bind(this, path, true));
        $(`[data-allclear="${path}"]`).on("click", this.setAllPerFile.bind(this, path, false));
    }

    setAllPerFile(path, set)
    {
        for (let d = 0; d < dmcore.diffs.length; d++) {
            let od = dmcore.diffs[d];
            if (od.path === path) {
                dmcore.setDone(od.getId(), set);
                dmcore.updateDiff(od, true);
            }
        }
        dmcore.updateStats();
        dmcore.initDataSave();

    }

    updateDiff(diff, updateFile)
    {
        updateFile = updateFile ?? true;
        this.addDiffHeader(diff);
        let id = diff.getId();
        let isDone = dmcore.isDone(id);
        for (let r = 0; r < diff.lines.length; r++) {
            let row = $(diff.lines[r].row);
            let elems = row.find("span, .lineContent , .diffContentA , .diffContentB , .diffLineNumbersA , .diffLineNumbersB");
            if (isDone) {
                elems.addClass("cdm-hidden");
            } else {
                elems.removeClass("cdm-hidden");
            }
        }

        $("." + id).on("click", dmcore.flip.bind(dmcore, diff));
        if (updateFile) {
            this.updateFile(diff.path);
        }
    }

    hideDiffHeader(diff)
    {
        $(diff.lines[0].row).find(".js-linkable-line-number").html("");
        $(diff.lines[0].row).find(".cdm-forcedBreak").removeClass("cdm-forcedBreak");
    }

    addDiffHeader(diff)
    {
        let id = diff.getId();
        let isDone = dmcore.isDone(id);
        let imgHTML = isDone ? dmcore.greenHTML: dmcore.redHTML;
        $(diff.lines[0].row)
            .find(".js-linkable-line-number")
            .html(`
<img ${imgHTML} width="20" height="20" class="${id}"
style="position: relative; top: 0; right: 20px; opacity: 80%; background-color: white"
/>
`);

        if (dmcore.data.breaks.indexOf(id) >= 0) {
            $(diff.lines[0].row).find("td").addClass("cdm-forcedBreak");
        }
    }

    updateCounter(done, total)
    {
    }

    getParentRow(target)
    {
        if (target.parents("[data-hunk]").length === 0) {
            return null;
        }

        // Find parent TR
        let row = target.parents("tr").get()[0];
        if (!this.isDiff(row)) {
            return null;
        }
        return row;
    }

    createDiffLine(row)
    {
        let tag = $(row).attr("data-hunk");
        let left = Number($(row.cells[0]).attr("data-line-number")) || 0;
        let right = Number($(row.cells[2]).attr("data-line-number")) || 0;
        return new DiffLine(tag, left, right, row);
    }

    getDiffContainerOffset()
    {
        let container = $("#files");
        let containerOffset = container.offset().top - container.scrollTop();
        return containerOffset;
    }

    generateDataKey()
    {
        return window.location.href.replace( /(.*\/pull\/\d+\/).*/, "$1");
    }

    markFileAsReviewed(id)
    {
    }

    foldAll()
    {
        $(".js-file").removeClass("open");
        $(".js-file").removeClass("Details--on");
    }

    unfoldAll()
    {
        $(".js-file").addClass("open");
        $(".js-file").addClass("Details--on");
    }

    selectionRemove(selection)
    {
        let col = selection.color;
        $(`span.cdm-selection-${col}`).each(function(idx, elem) {
            $(elem).replaceWith($(elem).text());
        });
    }

    selectionAdd(selection)
    {
        let selText = selection.text;
        let col = selection.color;

        const regex = new RegExp(`\\b${selText}\\b`, 'g');

        function replacer(idx, elem) {
            if (elem.nodeType == Node.TEXT_NODE) {
                // Text node, see if there's something to replace
                let oldText = $(elem).text();
                if (oldText.search(regex) >= 0) {
                    // Build new content from text divided by the selection
                    let newContent = [];
                    let texts = oldText.split(regex);
                    for (let i = 0 ; i < texts.length; i++) {
                        if (i > 0) {
                            let spanNode = $.parseHTML(`<span class='cdm-selection-${col}'>${selText}</span>`)[0];
                            newContent.push(spanNode);
                        }
                        let text = texts[i];
                        if (text !== '') {
                            let textNode = document.createTextNode(text);
                            newContent.push(textNode);
                        }
                    }
                    $(elem).replaceWith(newContent);
                }
            } else {
                // Go deeper
                $(elem).contents().each(replacer);
            }
        }

        $("span.blob-code-inner").each(replacer);
    }
}
