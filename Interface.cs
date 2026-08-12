class ClimateMonitor
{
    private ILogger logger;
    public ClimateMonitor(ILogger logger)
    {
        this.logger = logger;
    }

}

class Program
{
    static void Main()
    {
        ILogger consoleLogger = new ConsoleLogger();
        ClimateMonitor monitor = new ClimateMonitor(consoleLogger);  // ✅ 생성자 호출
    }
}