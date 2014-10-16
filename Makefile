## TESTS
SHELL=C:/Windows/System32/cmd.exe
TESTER = "./node_modules/.bin/mocha"
OPTS = -G
TESTS = "test/mongodb.test"

test:
	$(TESTER) $(OPTS) $(TESTS)
test-verbose:
	$(TESTER) $(OPTS) --reporter spec $(TESTS)
testing:
	$(TESTER) $(OPTS) --watch $(TESTS)

.PHONY: test docs
